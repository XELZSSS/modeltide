import { describe, expect, it, vi, beforeEach } from "vitest";
import { resetModuleCachesForTests } from "@/server/infra/cache/service";
import { fakeHttp, testCtx } from "@/server/test-helpers";
import {
  HISTORY_KEY,
  SAMPLE_LOCK_KEY,
  aggregateProbes,
  avgLatency,
  buildHistoryPayload,
  buildTargets,
  deriveEvents,
  ensureFreshSamples,
  getUptime,
  latestSampleAt,
  mergeSample,
  readStore,
  recordStatusSamples,
  uptimeRatio,
  type ProbeTarget,
} from "@/server/sources/status";
import { getStatusHistory } from "./status-history";
import { resetUptimeMemoForTests } from "./status/uptime";
import type { ProbeResult } from "@/server/infra/http-client";
import { SOURCE_IDS, UPTIME_WARN_RATIO } from "@/shared/config";
import { upstreamConfig } from "@/server/config";
import type { AppContext } from "@/server/context";
import type { DayBucket, SourceId, UptimeSample } from "@/shared/types";

beforeEach(() => {
  resetModuleCachesForTests();
  resetUptimeMemoForTests();
});

const MIN = 60_000;
const NOW = Date.UTC(2026, 7, 30, 12, 0, 0);
const historyId: SourceId = "openrouter";

const sample = (minAgo: number, ok: boolean, latencyMs: number | null = ok ? 900 : null): UptimeSample => ({
  t: NOW - minAgo * MIN,
  ok,
  latencyMs,
});
const warnSample = (minAgo: number): UptimeSample => ({ ...sample(minAgo, true), warn: true });

describe("getUptime", () => {
  it("persists first launch on the first call and reuses it later", async () => {
    const { ctx, kv } = testCtx();
    const before = Date.now();
    const { firstLaunchAt, uptimeMs } = await getUptime(ctx);

    const firstLaunchMs = Date.parse(firstLaunchAt);
    expect(firstLaunchMs).toBeGreaterThanOrEqual(before);
    // First launch stores the same `now` the delta is measured from, so uptime is exactly 0.
    expect(uptimeMs).toBe(0);
    expect(kv.store.get("uptime:first-launch")).toBe(String(firstLaunchMs));

    // Fresh isolate: the persisted value is what a later launch reads back.
    resetUptimeMemoForTests();
    const { ctx: ctx2 } = testCtx(new Map([["uptime:first-launch", String(firstLaunchMs)]]));
    const callStartedAt = Date.now();
    const reused = await getUptime(ctx2);
    const callFinishedAt = Date.now();
    expect(Date.parse(reused.firstLaunchAt)).toBe(firstLaunchMs);
    // getUptime stamps `now` on entry, so uptimeMs sits inside the call window.
    expect(reused.uptimeMs).toBeGreaterThanOrEqual(callStartedAt - firstLaunchMs);
    expect(reused.uptimeMs).toBeLessThanOrEqual(callFinishedAt - firstLaunchMs);
  });

  it("reads the first-launch key once per isolate", async () => {
    const start = 1_700_000_000_000;
    const { ctx, kv } = testCtx(new Map([["uptime:first-launch", String(start)]]));
    const gets = vi.spyOn(kv, "get");

    const first = await getUptime(ctx);
    const second = await getUptime(ctx);

    expect(gets).toHaveBeenCalledTimes(1);
    expect(gets).toHaveBeenCalledWith("uptime:first-launch");
    expect(first.firstLaunchAt).toBe(new Date(start).toISOString());
    expect(second.firstLaunchAt).toBe(first.firstLaunchAt);
  });
});

describe("mergeSample", () => {
  it("appends samples and prunes the 24h window", () => {
    const old = 25 * 60;
    let entry = mergeSample(undefined, sample(old, true), NOW);
    expect(entry.recent).toHaveLength(0);

    entry = mergeSample(entry, sample(10, true), NOW);
    entry = mergeSample(entry, sample(1, false), NOW);
    expect(entry.recent).toHaveLength(2);
    expect(entry.recent.some((s) => s.t === NOW - old * MIN)).toBe(false);
  });

  it("rolls back the replaced sample on upsert when the outcome flips", () => {
    let entry = mergeSample(undefined, sample(10, false), NOW);
    entry = mergeSample(entry, sample(9, true, 800), NOW);
    expect(entry.recent).toHaveLength(1);
    expect(entry.recent[0]).toMatchObject({ ok: true, latencyMs: 800 });
    expect(entry.daily.find((b) => b.day === "2026-08-30")).toMatchObject({ total: 1, ok: 1 });
  });

  it("rolls daily buckets and counts ok-to-fail transitions as incidents", () => {
    let entry = mergeSample(undefined, sample(30, true), NOW);
    entry = mergeSample(entry, sample(20, false), NOW);
    entry = mergeSample(entry, sample(10, false), NOW);
    entry = mergeSample(entry, sample(0, true), NOW);

    expect(entry.daily).toHaveLength(1);
    expect(entry.daily[0]).toMatchObject({ day: "2026-08-30", total: 4, ok: 2 });
  });

  it("prunes daily buckets beyond the 30-day retention", () => {
    // 2026-07-15 is 46 days before NOW: kept under the old 90-day window,
    // dropped under the 30-day retention.
    const stale: DayBucket = { day: "2026-07-15", total: 10, ok: 10 };
    const entry = mergeSample({ recent: [], daily: [stale] }, sample(0, true), NOW);
    expect(entry.daily.some((b) => b.day === "2026-07-15")).toBe(false);
    expect(entry.daily[entry.daily.length - 1]!.day).toBe("2026-08-30");
  });
});

describe("uptimeRatio / avgLatency", () => {
  it("returns null for an empty window and ratios over in-window samples only", () => {
    expect(uptimeRatio([], NOW - 60 * MIN)).toBeNull();
    expect(avgLatency([], NOW - 60 * MIN)).toBeNull();
    const samples = [sample(100, true), sample(10, true), sample(5, false), sample(1, true)];
    expect(uptimeRatio(samples, NOW - 30 * MIN)).toBe(2 / 3);
    expect(avgLatency(samples, NOW - 30 * MIN)).toBe((900 + 900) / 2);
  });
});

const target = (id: SourceId): ProbeTarget => ({ id, url: `https://upstream.test/${id}` });
const okProbe = (status = 200, latencyMs = 500) => ({ ok: true, status, latencyMs, error: null });
const failProbe = (error = "network error") => ({ ok: false, status: null, latencyMs: null, error });

/**
 * Route probe results per URL with `vi.when`: URLs listed in `downFor` fail;
 * every other call falls through to the default `okProbe()` implementation.
 */
function mockProbe(downFor: string[] = []) {
  const down: ProbeResult = { ok: false, status: 503, latencyMs: null, error: "HTTP 503" };
  const probe = vi.fn<(url: string) => Promise<ProbeResult>>();
  probe.mockResolvedValue(okProbe());
  for (const url of downFor) {
    vi.when(probe).calledWith(url).thenResolve(down);
  }
  return probe;
}

describe("aggregateProbes", () => {
  it("any successful probe makes the source healthy; the fastest success donates latency", () => {
    expect(
      aggregateProbes([
        { target: target("news"), probe: okProbe(200, 300) },
        { target: target("news"), probe: failProbe() },
        { target: target("news"), probe: okProbe(204, 700) },
      ]).get("news"),
    ).toEqual({ ok: true, status: 200, latencyMs: 300, error: null });
  });

  it("names the failing endpoints in the failure detail", () => {
    const http503 = { ok: false, status: 503, latencyMs: null, error: "HTTP 503" } as const;
    expect(
      aggregateProbes([
        { target: target("news"), probe: { ...http503 } },
        { target: { id: "news", url: "https://other.test/feed" }, probe: { ...http503 } },
      ]).get("news"),
    ).toEqual({
      ok: false,
      status: null,
      latencyMs: null,
      error: "2/2 endpoints failed: HTTP 503 (upstream.test); HTTP 503 (other.test)",
    });
  });

  it("reports a single failing endpoint by its own error, and a partial failure as a warning", () => {
    const http503 = { ok: false, status: 503, latencyMs: null, error: "HTTP 503" } as const;
    expect(aggregateProbes([{ target: target("huggingface"), probe: { ...http503 } }]).get("huggingface")).toEqual({
      ok: false,
      status: null,
      latencyMs: null,
      error: "HTTP 503 (upstream.test)",
    });

    // Partial loss keeps the warning text so a degraded event can explain itself.
    expect(
      aggregateProbes([
        { target: target("news"), probe: okProbe(200, 300) },
        { target: { id: "news", url: "https://down.test/feed" }, probe: { ...http503 } },
      ]).get("news"),
    ).toEqual({
      ok: true,
      warn: true,
      warnReason: "1/2 endpoints failed: HTTP 503 (down.test)",
      status: 200,
      latencyMs: 300,
      error: null,
    });
  });

  it("omits a source whose probes all timed out (unknown, not down)", () => {
    const agg = aggregateProbes([
      { target: target("huggingface"), probe: failProbe("timeout") },
      { target: target("news"), probe: failProbe("network error") },
      { target: target("news"), probe: failProbe("timeout") },
    ]);
    expect(agg.has("huggingface")).toBe(false);
    expect(agg.has("news")).toBe(false);
  });
});

describe("deriveEvents", () => {
  it("pairs a down event with its duration, detail and an up event on recovery", () => {
    const down = { ...sample(20, false), error: "HTTP 503 (api.openrouter.ai)" };
    expect(deriveEvents(historyId, [sample(30, true), down, sample(10, false), sample(0, true)])).toEqual([
      {
        id: historyId,
        type: "down",
        at: new Date(NOW - 20 * MIN).toISOString(),
        durationMin: 20,
        detail: "HTTP 503 (api.openrouter.ai)",
      },
      { id: historyId, type: "up", at: new Date(NOW).toISOString(), durationMin: null, detail: null },
    ]);
  });

  it("keeps durationMin null for an ongoing outage and emits nothing when healthy", () => {
    const events = deriveEvents(historyId, [
      sample(30, true),
      { ...sample(10, false), error: "timeout (api.openrouter.ai)" },
      sample(5, false),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "down", durationMin: null, detail: "timeout (api.openrouter.ai)" });
    expect(deriveEvents(historyId, [sample(10, true), sample(0, true)])).toHaveLength(0);
  });

  it("carries the provider's warning on a degraded event and follows it while the incident is open", () => {
    const opened = { ...warnSample(20), warnReason: "Minor Service Outage: Elevated error rates" };
    const updated = { ...warnSample(10), warnReason: "Minor Service Outage: Elevated error rates on the API" };
    expect(deriveEvents(historyId, [sample(30, true), opened, updated, sample(0, true)])).toEqual([
      {
        id: historyId,
        type: "degraded",
        at: new Date(NOW - 20 * MIN).toISOString(),
        durationMin: 20,
        detail: "Minor Service Outage: Elevated error rates on the API",
      },
      { id: historyId, type: "up", at: new Date(NOW).toISOString(), durationMin: null, detail: null },
    ]);
  });
});

describe("buildHistoryPayload", () => {
  const emptyPayload = () =>
    buildHistoryPayload({ sources: {} }, { firstLaunchAt: new Date(NOW).toISOString(), uptimeMs: 0 }, NOW);

  it("reports null uptimes for an empty store, marks sources down, covers every provider", () => {
    const payload = emptyPayload();
    expect(payload.sources).toHaveLength(SOURCE_IDS.length);
    expect(payload.sources.map((s) => s.id)).toHaveLength(new Set(payload.sources.map((s) => s.id)).size);
    for (const provider of [
      "openaiApi",
      "anthropicApi",
      "googleCloudApi",
      "groqApi",
      "cohereApi",
      "fireworksApi",
      "cerebrasApi",
      "deepseekApi",
      "moonshotApi",
    ] as const) {
      expect(payload.sources.map((s) => s.id)).toContain(provider);
    }
    const or = payload.sources.find((s) => s.id === historyId)!;
    expect(or).toMatchObject({
      uptime24h: null,
      uptime7d: null,
      avgLatency24h: null,
      ok: false,
      level: "unknown",
    });
    expect(payload.events).toHaveLength(0);
    expect(payload.uptimeMs).toBe(0);
  });

  it("derives recent uptime from samples and 7d from the trailing daily buckets", () => {
    const recent: UptimeSample[] = [sample(20, true), sample(10, true), sample(1, false)];
    // 10 stale April buckets: must not feed the trailing-7 slice used for 7d.
    const stale: DayBucket[] = Array.from({ length: 10 }, (_, i) => ({
      day: `2026-04-${String(i + 21).padStart(2, "0")}`,
      total: 200,
      ok: 0,
    }));
    const fresh: DayBucket[] = Array.from({ length: 30 }, (_, i) => ({
      day: `2026-08-${String(i + 1).padStart(2, "0")}`,
      total: 100,
      ok: 99,
    }));
    const payload = buildHistoryPayload(
      { sources: { [historyId]: { recent, daily: [...stale, ...fresh] } } },
      { firstLaunchAt: new Date(NOW).toISOString(), uptimeMs: 5 * MIN },
      NOW,
    );
    const or = payload.sources.find((s) => s.id === historyId)!;
    expect(or.uptime24h).toBeCloseTo(2 / 3);
    expect(or.uptime7d).toBeCloseTo(0.99);
    expect(or.ok).toBe(false);
    expect(or.level).toBe("error");
    expect(or.checkedAt).toBe(new Date(NOW - MIN).toISOString());
    expect(payload.uptimeMs).toBe(5 * MIN);
  });

  it("errors when an outage pushed 24h uptime below the error band", () => {
    const payload = buildHistoryPayload(
      { sources: { [historyId]: { recent: [sample(30, true), sample(20, false), sample(10, true)], daily: [] } } },
      { firstLaunchAt: new Date(NOW).toISOString(), uptimeMs: 0 },
      NOW,
    );
    const or = payload.sources.find((s) => s.id === historyId)!;
    expect(or.ok).toBe(true);
    // 2/3 of samples up is below UPTIME_ERROR_RATIO, so the summary is red like
    // the 30-day strip; it previously stopped at "warn" however low it fell.
    expect(or.uptime24h).toBeCloseTo(2 / 3, 5);
    expect(or.level).toBe("error");
  });

  it("reports the latest failure or degradation detail per source", () => {
    const payload = buildHistoryPayload(
      {
        sources: {
          [historyId]: {
            recent: [{ ...sample(10, true), warn: true, warnReason: "Minor Service Outage: API latency" }],
            daily: [],
          },
          news: { recent: [{ ...sample(10, false), error: "2/6 endpoints failed: HTTP 503 (techcrunch.com)" }], daily: [] },
        },
      },
      { firstLaunchAt: new Date(NOW).toISOString(), uptimeMs: 0 },
      NOW,
    );
    expect(payload.sources.find((s) => s.id === historyId)?.detail).toBe("Minor Service Outage: API latency");
    expect(payload.sources.find((s) => s.id === "news")?.detail).toBe(
      "2/6 endpoints failed: HTTP 503 (techcrunch.com)",
    );
    // A healthy source carries no detail rather than a stale one.
    expect(payload.sources.find((s) => s.id === "huggingface")?.detail).toBeNull();
  });

  it("warns when a brief outage kept 24h uptime inside the error band", () => {
    // 198/199 up = 0.9950 in [UPTIME_ERROR_RATIO, UPTIME_WARN_RATIO).
    const recent = [sample(199, false), ...Array.from({ length: 198 }, (_, i) => sample(198 - i, true))];
    const payload = buildHistoryPayload(
      { sources: { [historyId]: { recent, daily: [] } } },
      { firstLaunchAt: new Date(NOW).toISOString(), uptimeMs: 0 },
      NOW,
    );
    const or = payload.sources.find((s) => s.id === historyId)!;
    expect(or.ok).toBe(true);
    expect(or.uptime24h).toBeGreaterThanOrEqual(0.95);
    expect(or.uptime24h).toBeLessThan(UPTIME_WARN_RATIO);
    expect(or.level).toBe("warn");
  });
});

describe("getStatusHistory read-only", () => {
  const statusJson = (url: string) =>
    url.includes("status.cloud.google.com") ? [] : { components: [{ name: "API", status: "operational" }] };
  const okHttpProbe: AppContext["http"]["probe"] = async () => ({ ok: true, status: 200, latencyMs: 500, error: null });

  /** `probe` defaults to a healthy target; a spy can be passed to assert on the calls. */
  function historyCtx(
    kvStore: Map<string, string>,
    probe: AppContext["http"]["probe"] = okHttpProbe,
    json: (url: string) => unknown = statusJson,
  ): AppContext {
    return testCtx(kvStore, { http: fakeHttp({ probe, json }) }).ctx;
  }

  const degradedPage = {
    status: { indicator: "minor", description: "Partially Degraded Service" },
    components: [{ name: "API", status: "degraded_performance" }],
    incidents: [{ name: "Elevated error rates on the API", status: "investigating", impact: "minor" }],
  };

  it("stores the provider's own warning text and shows it on the degraded event", async () => {
    const kvStore = new Map<string, string>();
    await recordStatusSamples(historyCtx(kvStore, okHttpProbe, async () => degradedPage));
    const payload = await getStatusHistory(historyCtx(kvStore));
    const detail = "Partially Degraded Service: Elevated error rates on the API";
    const page = payload.sources.find((s) => s.id === "openaiApi")!;
    expect(page.level).toBe("warn");
    expect(page.detail).toBe(detail);
    expect(payload.events.find((e) => e.id === "openaiApi")).toMatchObject({
      type: "degraded",
      durationMin: null,
      detail,
    });
  });

  it("stores the incident text as the failure detail when the page reports an outage", async () => {
    const kvStore = new Map<string, string>();
    const outage = {
      status: { indicator: "critical", description: "Major Service Outage" },
      components: [{ name: "API", status: "major_outage" }],
      incidents: [{ name: "API unavailable", status: "identified", impact: "critical" }],
    };
    await recordStatusSamples(historyCtx(kvStore, okHttpProbe, async () => outage));
    const payload = await getStatusHistory(historyCtx(kvStore));
    const detail = "Major Service Outage: API unavailable";
    expect(payload.sources.find((s) => s.id === "openaiApi")?.detail).toBe(detail);
    expect(payload.events.find((e) => e.id === "openaiApi")).toMatchObject({ type: "down", detail });
  });

  it("serves an empty store without sampling, so reads never touch upstreams", async () => {
    const kvStore = new Map<string, string>();
    const probe = mockProbe();
    const payload = await getStatusHistory(historyCtx(kvStore, probe));
    expect(kvStore.has(HISTORY_KEY)).toBe(false);
    expect(probe).not.toHaveBeenCalled();
    expect(payload.sources.every((s) => s.ok === false)).toBe(true);
  });

  it("serves persisted samples without re-probing", async () => {
    const kvStore = new Map<string, string>();
    await recordStatusSamples(historyCtx(kvStore));
    expect(kvStore.has(HISTORY_KEY)).toBe(true);
    const probe = mockProbe();
    const payload = await getStatusHistory(historyCtx(kvStore, probe));
    const or = payload.sources.find((s) => s.id === "openrouter")!;
    expect(or.ok).toBe(true);
    expect(or.checkedAt).not.toBeNull();
    expect(or.uptime24h).toBe(1);
    expect(probe).not.toHaveBeenCalled();
  });

  it("skips the write while the lock is held instead of racing the writer", async () => {
    const lockValue = `owner-${Date.now()}:${Date.now() + 120_000}`;
    const kvStore = new Map<string, string>([[SAMPLE_LOCK_KEY, lockValue]]);
    await recordStatusSamples(historyCtx(kvStore));
    expect(kvStore.has(HISTORY_KEY)).toBe(false);
  });

  it("marks only the failing source down when probes disagree per target", async () => {
    const kvStore = new Map<string, string>();
    const openrouterUrl = `${upstreamConfig.openrouter}/api/v1/models`;
    const openrouterRankingsUrl = `${upstreamConfig.openrouter}/api/frontend/v1/rankings/models`;
    const probe = mockProbe([openrouterUrl, openrouterRankingsUrl]);
    await recordStatusSamples(historyCtx(kvStore, probe));
    const payload = await getStatusHistory(historyCtx(kvStore));
    const or = payload.sources.find((s) => s.id === "openrouter")!;
    expect(or.ok).toBe(false);
    expect(or.uptime24h).toBe(0);
    for (const s of payload.sources) {
      if (s.id === "openrouter") continue;
      expect(s.ok).toBe(true);
    }
    expect(probe).toHaveBeenCalledWith(openrouterUrl);
    expect(probe).toHaveBeenCalledWith(openrouterRankingsUrl);
  });

  it("writes nothing and logs loudly when the whole round is unknown", async () => {
    const kvStore = new Map<string, string>();
    const log = vi.fn();
    const ctx = testCtx(kvStore, {
      log,
      http: fakeHttp({
        probe: async () => ({ ok: false, status: null, latencyMs: null, error: "timeout" }),
        json: async () => {
          throw new Error("timeout");
        },
      }),
    }).ctx;
    await expect(recordStatusSamples(ctx)).resolves.toBe(false);
    expect(kvStore.has(HISTORY_KEY)).toBe(false);
    expect(log.mock.calls.some((c) => String(c[1] ?? c[0]).includes("no samples"))).toBe(true);
  });

  it("self-heals a stale history on read so a cron gap cannot outlive the next visit", async () => {
    const staleAt = Date.now() - 60 * 60 * 1000;
    const stale = {
      sources: {
        openrouter: { recent: [{ t: staleAt, ok: true, latencyMs: 1, status: 200, error: null }], daily: [] },
      },
    };
    const kvStore = new Map<string, string>([[HISTORY_KEY, JSON.stringify(stale)]]);
    const probe = mockProbe();
    const payload = await getStatusHistory(historyCtx(kvStore, probe));
    expect(probe).toHaveBeenCalled();
    const or = payload.sources.find((s) => s.id === "openrouter")!;
    expect(Date.now() - Date.parse(or.checkedAt!)).toBeLessThan(60_000);
  });
});

describe("buildTargets", () => {
  it("probes one representative feed per news category plus daily papers", async () => {
    const { NEWS_CATEGORIES } = await import("@/shared/config");
    const { rssConfig, upstreamConfig, upstreamEndpoints } = await import("@/server/config");
    const targets = buildTargets();
    const news = targets.filter((t) => t.id === "news");
    // Every feed is fetched by the news warmup in the same cron fire; the probe
    // only needs to tell whether the category is reachable.
    expect(news).toHaveLength(NEWS_CATEGORIES.length + 1);
    expect(news.map((t) => t.url)).toEqual([
      ...NEWS_CATEGORIES.map((category) => rssConfig[category][0]),
      `${upstreamConfig.huggingfaceSite}${upstreamEndpoints.hfDailyPapers}`,
    ]);
    expect(targets.filter((t) => t.id === "openrouter")).toHaveLength(2);
    expect(targets.filter((t) => t.id === "artificialAnalysis")).toHaveLength(2);
    expect(targets.some((t) => t.id === "arena")).toBe(true);
    expect(SOURCE_IDS).not.toContain("officialPricing");
    expect(targets.every((t) => (SOURCE_IDS as readonly string[]).includes(t.id))).toBe(true);
    expect(NEWS_CATEGORIES.length).toBeGreaterThan(0);
  });
});

describe("readStore", () => {
  it("drops corrupt entries and salvages readable per-source data instead of throwing", async () => {
    const corrupt = new Map<string, string>([[HISTORY_KEY, "truncated-json{{{"]]);
    await expect(readStore(testCtx(corrupt).ctx)).resolves.toEqual({ sources: {} });
    expect(corrupt.has(HISTORY_KEY)).toBe(false);

    const good = {
      recent: [{ t: Date.now() - 60_000, ok: true, latencyMs: 10, status: 200, error: null }],
      daily: [{ day: "2026-01-01", total: 3, ok: 2 }],
    };
    const raw = JSON.stringify({ sources: { openrouter: good, news: "garbage-not-an-entry" } });
    const { ctx } = testCtx(new Map<string, string>([[HISTORY_KEY, raw]]));
    await expect(readStore(ctx)).resolves.toEqual({ sources: { openrouter: good } });
  });

  it("reports the newest sample across all sources", () => {
    const t0 = 1_000;
    const t1 = 2_000;
    expect(
      latestSampleAt({
        sources: {
          openrouter: { recent: [{ t: t0, ok: true, latencyMs: 1, status: 200, error: null }], daily: [] },
          news: { recent: [{ t: t1, ok: false, latencyMs: null, status: 503, error: "x" }], daily: [] },
        },
      }),
    ).toBe(t1);
    expect(latestSampleAt({ sources: {} })).toBe(0);
  });

  it("warns (throttled) when the persisted samples stop advancing", async () => {
    const stale = Date.now() - 3 * 60 * 60 * 1000;
    const store = {
      sources: { openrouter: { recent: [{ t: stale, ok: true, latencyMs: 1, status: 200, error: null }], daily: [] } },
    };
    const kvStore = new Map<string, string>([[HISTORY_KEY, JSON.stringify(store)]]);
    const log = vi.fn();
    const { ctx } = testCtx(kvStore, { log });
    await ensureFreshSamples(ctx);
    await ensureFreshSamples(ctx);
    const staleWarns = log.mock.calls.filter((c) => String(c[1] ?? c[0]).includes("stale"));
    expect(staleWarns).toHaveLength(1);
    expect(staleWarns[0]![0]).toBe("warn");
  });
});
