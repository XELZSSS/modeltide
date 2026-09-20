import { describe, expect, it, vi, beforeEach } from "vitest";
import { resetModuleCachesForTests } from "@/server/infra/cache-service";
import { testCtx } from "@/server/test-helpers";
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
import type { ProbeResult } from "@/server/infra/http-client";
import { SOURCE_IDS } from "@/shared/config";
import { upstreamConfig } from "@/server/config";
import type { AppContext } from "@/server/context";
import type { DayBucket, SourceStatus, UptimeSample } from "@/shared/types";

beforeEach(() => resetModuleCachesForTests());

const MIN = 60_000;
const NOW = Date.UTC(2026, 7, 30, 12, 0, 0);
const historyId: SourceStatus["id"] = "openrouter";

const sample = (minAgo: number, ok: boolean, latencyMs: number | null = ok ? 900 : null): UptimeSample => ({
  t: NOW - minAgo * MIN,
  ok,
  latencyMs,
});
const warnSample = (minAgo: number): UptimeSample => ({ ...sample(minAgo, true), warn: true });

describe("getUptime", () => {
  it("persists first launch on the first call and reports ~zero uptime", async () => {
    const { ctx, kv } = testCtx();
    const before = Date.now();
    const { firstLaunchAt, uptimeMs } = await getUptime(ctx);

    const firstLaunchMs = Date.parse(firstLaunchAt);
    expect(firstLaunchMs).toBeGreaterThanOrEqual(before);
    expect(uptimeMs).toBeLessThanOrEqual(Date.now() - before + 5);
    expect(kv.store.get("uptime:first-launch")).toBe(String(firstLaunchMs));
  });

  it("reuses the persisted first-launch timestamp on later calls", async () => {
    const persisted = Date.now() - 86_400_000;
    const { ctx } = testCtx(new Map([["uptime:first-launch", String(persisted)]]));
    const { firstLaunchAt, uptimeMs } = await getUptime(ctx);

    expect(Date.parse(firstLaunchAt)).toBe(persisted);
    expect(uptimeMs).toBeGreaterThanOrEqual(86_400_000);
  });

  it("degrades to an ephemeral first launch when KV writes fail", async () => {
    const { ctx, kv } = testCtx();
    kv.failPut = true;
    const { firstLaunchAt, uptimeMs } = await getUptime(ctx);

    expect(Number.isFinite(Date.parse(firstLaunchAt))).toBe(true);
    expect(uptimeMs).toBeGreaterThanOrEqual(0);
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

  it("upserts a sample landing inside half the interval instead of duplicating", () => {
    let entry = mergeSample(undefined, sample(10, true, 500), NOW);
    entry = mergeSample(entry, sample(9, true, 700), NOW);
    expect(entry.recent).toHaveLength(1);
    expect(entry.recent[0]!.latencyMs).toBe(700);
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

  it("counts a failing first sample", () => {
    expect(mergeSample(undefined, sample(5, false), NOW).daily[0]!.total).toBe(1);
  });

  it("keeps one incident when the outage recovers after the flipped re-run", () => {
    let entry = mergeSample(undefined, sample(10, true), NOW);
    entry = mergeSample(entry, sample(9, false), NOW);
    entry = mergeSample(entry, sample(7, true, 400), NOW);
    expect(entry.daily.find((b) => b.day === "2026-08-30")).toMatchObject({ total: 2, ok: 1 });
    expect(entry.recent.at(-1)).toMatchObject({ ok: true, latencyMs: 400 });
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
  it("returns null for an empty window", () => {
    expect(uptimeRatio([], NOW - 60 * MIN)).toBeNull();
    expect(avgLatency([], NOW - 60 * MIN)).toBeNull();
  });

  it("computes the ratio over in-window samples only", () => {
    const samples = [sample(100, true), sample(10, true), sample(5, false), sample(1, true)];
    expect(uptimeRatio(samples, NOW - 30 * MIN)).toBe(2 / 3);
    expect(avgLatency(samples, NOW - 30 * MIN)).toBe((900 + 900) / 2);
  });

  it("returns null latency when every sample in the window failed", () => {
    expect(avgLatency([sample(5, false), sample(1, false)], NOW - 30 * MIN)).toBeNull();
  });
});

const target = (id: SourceStatus["id"]): ProbeTarget => ({ id, url: `https://upstream.test/${id}` });
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

  it("summarizes total failure across multiple feeds as x/y failed", () => {
    const http503 = { ok: false, status: 503, latencyMs: null, error: "HTTP 503" } as const;
    expect(
      aggregateProbes([
        { target: target("news"), probe: { ...http503 } },
        { target: target("news"), probe: { ...http503 } },
      ]).get("news"),
    ).toEqual({ ok: false, status: null, latencyMs: null, error: "2/2 feeds failed" });
  });

  it("keeps the single-feed error message when only one target exists", () => {
    expect(
      aggregateProbes([
        { target: target("openrouter"), probe: { ok: false, status: 500, latencyMs: null, error: "HTTP 500" } },
      ]).get("openrouter")!.error,
    ).toBe("HTTP 500");
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

  it("counts only decisive probes when unknowns mix with real failures", () => {
    expect(
      aggregateProbes([
        { target: target("news"), probe: { ok: false, status: 503, latencyMs: null, error: "HTTP 503" } },
        { target: target("news"), probe: failProbe("timeout") },
      ]).get("news"),
    ).toEqual({ ok: false, status: null, latencyMs: null, error: "HTTP 503" });
  });
});

describe("deriveEvents", () => {
  it("pairs a down event with its duration and an up event on recovery", () => {
    expect(deriveEvents(historyId, [sample(30, true), sample(20, false), sample(10, false), sample(0, true)])).toEqual([
      { id: historyId, type: "down", at: new Date(NOW - 20 * MIN).toISOString(), durationMin: 20 },
      { id: historyId, type: "up", at: new Date(NOW).toISOString(), durationMin: null },
    ]);
  });

  it("keeps durationMin null for an ongoing outage", () => {
    const events = deriveEvents(historyId, [sample(30, true), sample(10, false), sample(5, false)]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "down", durationMin: null });
  });

  it("treats a failing first sample as an ongoing outage", () => {
    const events = deriveEvents(historyId, [sample(10, false), sample(0, false)]);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("down");
  });

  it("emits nothing for a fully healthy window", () => {
    expect(deriveEvents(historyId, [sample(10, true), sample(0, true)])).toHaveLength(0);
  });

  it("emits a degraded event for warn samples and closes it with up", () => {
    expect(deriveEvents(historyId, [sample(30, true), warnSample(20), warnSample(10), sample(0, true)])).toEqual([
      { id: historyId, type: "degraded", at: new Date(NOW - 20 * MIN).toISOString(), durationMin: 20 },
      { id: historyId, type: "up", at: new Date(NOW).toISOString(), durationMin: null },
    ]);
  });

  it("escalates an ongoing degraded episode straight to down without an up in between", () => {
    expect(deriveEvents(historyId, [sample(30, true), warnSample(20), sample(10, false)])).toEqual([
      { id: historyId, type: "degraded", at: new Date(NOW - 20 * MIN).toISOString(), durationMin: 10 },
      { id: historyId, type: "down", at: new Date(NOW - 10 * MIN).toISOString(), durationMin: null },
    ]);
  });

  it("eases an outage back to degraded: up is emitted before the new degraded event", () => {
    expect(deriveEvents(historyId, [sample(40, true), sample(30, false), warnSample(20)])).toEqual([
      { id: historyId, type: "down", at: new Date(NOW - 30 * MIN).toISOString(), durationMin: 10 },
      { id: historyId, type: "up", at: new Date(NOW - 20 * MIN).toISOString(), durationMin: null },
      { id: historyId, type: "degraded", at: new Date(NOW - 20 * MIN).toISOString(), durationMin: null },
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
      uptime30d: null,
      avgLatency24h: null,
      ok: false,
      level: "unknown",
    });
    expect(payload.events).toHaveLength(0);
    expect(payload.uptimeMs).toBe(0);
    expect(payload.generatedAt).toBe(new Date(NOW).toISOString());
  });

  it("derives recent uptime from samples and 7d/30d from daily buckets", () => {
    const recent: UptimeSample[] = [sample(20, true), sample(10, true), sample(1, false)];
    // 10 stale buckets outside the 30-day window: counted by an unbounded
    // average, excluded by the retained-window slice.
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
    expect(or.uptime30d).toBeCloseTo(0.99);
    expect(or.ok).toBe(false);
    expect(or.level).toBe("error");
    expect(or.checkedAt).toBe(new Date(NOW - MIN).toISOString());
    expect(payload.uptimeMs).toBe(5 * MIN);
  });

  it("warns when currently up but an outage hit the last 24h", () => {
    const payload = buildHistoryPayload(
      { sources: { [historyId]: { recent: [sample(30, true), sample(20, false), sample(10, true)], daily: [] } } },
      { firstLaunchAt: new Date(NOW).toISOString(), uptimeMs: 0 },
      NOW,
    );
    const or = payload.sources.find((s) => s.id === historyId)!;
    expect(or.ok).toBe(true);
    expect(or.level).toBe("warn");
  });

  it("warns on a degraded provider sample even with a perfect ratio", () => {
    const payload = buildHistoryPayload(
      { sources: { [historyId]: { recent: [sample(30, true), warnSample(10)], daily: [] } } },
      { firstLaunchAt: new Date(NOW).toISOString(), uptimeMs: 0 },
      NOW,
    );
    const or = payload.sources.find((s) => s.id === historyId)!;
    expect(or.ok).toBe(true);
    expect(or.uptime24h).toBe(1);
    expect(or.level).toBe("warn");
  });

  it("reports uptime30d as null (not 0%) when daily buckets carry no samples", () => {
    const payload = buildHistoryPayload(
      { sources: { [historyId]: { recent: [], daily: [{ day: "2026-08-30", total: 0, ok: 0 }] } } },
      { firstLaunchAt: new Date(NOW).toISOString(), uptimeMs: 0 },
      NOW,
    );
    expect(payload.sources.find((s) => s.id === historyId)!.uptime30d).toBeNull();
  });
});

describe("getStatusHistory read-only", () => {
  function historyCtx(kvStore: Map<string, string>, probeOk = true): AppContext {
    return testCtx(kvStore, {
      http: {
        probe: async () => ({ ok: probeOk, status: probeOk ? 200 : 503, latencyMs: probeOk ? 500 : null, error: null }),
        json: async (url: string) => {
          if (url.includes("status.cloud.google.com")) return [];
          return { components: [{ name: "API", status: "operational" }] };
        },
      } as unknown as AppContext["http"],
    }).ctx;
  }

  /** historyCtx clone whose http.probe is a spyable mock. */
  function withProbe(kvStore: Map<string, string>, probe: AppContext["http"]["probe"]): AppContext {
    const base = historyCtx(kvStore);
    return { ...base, http: { ...base.http, probe } as unknown as AppContext["http"] };
  }

  const unknownRoundCtx = (kvStore: Map<string, string>): AppContext => {
    const base = historyCtx(kvStore);
    return {
      ...base,
      http: {
        ...base.http,
        probe: async () => ({ ok: false, status: null, latencyMs: null, error: "timeout" }),
        json: async () => {
          throw new Error("timeout");
        },
      },
    } as unknown as AppContext;
  };

  it("serves an empty store without sampling, so reads never touch upstreams", async () => {
    const kvStore = new Map<string, string>();
    const probe = mockProbe();
    const payload = await getStatusHistory(withProbe(kvStore, probe));
    expect(kvStore.has(HISTORY_KEY)).toBe(false);
    expect(probe).not.toHaveBeenCalled();
    expect(payload.sources.every((s) => s.ok === false)).toBe(true);
  });

  it("serves persisted samples without re-probing", async () => {
    const kvStore = new Map<string, string>();
    await recordStatusSamples(historyCtx(kvStore));
    expect(kvStore.has(HISTORY_KEY)).toBe(true);
    const probe = mockProbe();
    const payload = await getStatusHistory(withProbe(kvStore, probe));
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

  it("records a failed probe as a down sample when probes fail", async () => {
    const kvStore = new Map<string, string>();
    await recordStatusSamples(historyCtx(kvStore, false));
    const payload = await getStatusHistory(historyCtx(kvStore));
    const or = payload.sources.find((s) => s.id === "openrouter")!;
    expect(or.ok).toBe(false);
    expect(or.latencyMs).toBeNull();
    expect(or.uptime24h).toBe(0);
  });

  it("marks only the failing source down when probes disagree per target", async () => {
    const kvStore = new Map<string, string>();
    const openrouterUrl = `${upstreamConfig.openrouter}/api/v1/models`;
    const openrouterRankingsUrl = `${upstreamConfig.openrouter}/api/frontend/v1/rankings/models`;
    const probe = mockProbe([openrouterUrl, openrouterRankingsUrl]);
    await recordStatusSamples(withProbe(kvStore, probe));
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

  it("keeps a source healthy when any of its probes succeeds", async () => {
    const kvStore = new Map<string, string>();
    const openrouterUrl = `${upstreamConfig.openrouter}/api/v1/models`;
    await recordStatusSamples(withProbe(kvStore, mockProbe([openrouterUrl])));
    const payload = await getStatusHistory(historyCtx(kvStore));
    expect(payload.sources.find((s) => s.id === historyId)!.ok).toBe(true);
  });

  it("writes nothing when the whole round is unknown (all probes time out, all status pages fail)", async () => {
    const kvStore = new Map<string, string>();
    await recordStatusSamples(unknownRoundCtx(kvStore));
    expect(kvStore.has(HISTORY_KEY)).toBe(false);
  });

  it("keeps the previous state when a later round is unknown", async () => {
    const kvStore = new Map<string, string>();
    await recordStatusSamples(historyCtx(kvStore));
    expect((await getStatusHistory(historyCtx(kvStore))).sources.find((s) => s.id === historyId)!.ok).toBe(true);
    await recordStatusSamples(unknownRoundCtx(kvStore));
    const after = await getStatusHistory(historyCtx(kvStore));
    expect(after.sources.find((s) => s.id === historyId)!.ok).toBe(true);
    expect(after.events).toHaveLength(0);
  });
});

describe("buildTargets", () => {
  it("probes every news leg (all feeds + daily papers) so one dead feed can't flip news", async () => {
    const { NEWS_CATEGORIES } = await import("@/shared/config");
    const { rssConfig, upstreamConfig, upstreamEndpoints } = await import("@/server/config");
    const targets = buildTargets();
    const news = targets.filter((t) => t.id === "news");
    const feedCount = Object.values(rssConfig).reduce((a, feeds) => a + feeds.length, 0);
    expect(news).toHaveLength(feedCount + 1);
    expect(news.some((t) => t.url === `${upstreamConfig.huggingfaceSite}${upstreamEndpoints.hfDailyPapers}`)).toBe(
      true,
    );
    expect(targets).toHaveLength(6 + feedCount + 1);
    expect(targets.filter((t) => t.id === "openrouter")).toHaveLength(2);
    expect(targets.filter((t) => t.id === "artificialAnalysis")).toHaveLength(2);
    expect(targets.some((t) => t.id === "arena")).toBe(true);
    expect(SOURCE_IDS).not.toContain("officialPricing");
    expect(targets.every((t) => (SOURCE_IDS as readonly string[]).includes(t.id))).toBe(true);
    expect(NEWS_CATEGORIES.length).toBeGreaterThan(0);
  });
});

describe("readStore", () => {
  it("self-heals a corrupted history entry instead of throwing", async () => {
    const kvStore = new Map<string, string>([[HISTORY_KEY, "truncated-json{{{"]]);
    const { ctx } = testCtx(kvStore);
    await expect(readStore(ctx)).resolves.toEqual({ sources: {} });
    expect(kvStore.has(HISTORY_KEY)).toBe(false);
  });

  it("drops a corrupt history entry without retaining a backup", async () => {
    const raw = "truncated-json{{{";
    const { ctx, kvStore } = testCtx(new Map<string, string>([[HISTORY_KEY, raw]]));
    await expect(readStore(ctx)).resolves.toEqual({ sources: {} });
    expect(kvStore.has(HISTORY_KEY)).toBe(false);
  });

  it("salvages the readable per-source entries of a partially corrupt store", async () => {
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
