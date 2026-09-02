import { describe, expect, it } from "vitest";
import { mergeSample } from "./status-history/merge";
import { deriveEvents } from "./status-history/events";
import { buildHistoryPayload } from "./status-history/payload";
import { uptimeRatio, avgLatency } from "./status-history/utils";
import { getStatusHistory, statusFromStore } from "./status-history/store";
import type { HistoryStore } from "./status-history/types";
import { aggregateProbes, type ProbeTarget } from "@/server/sources/probe";
import type { AppContext } from "@/server/context";
import type { DayBucket, UptimeSample } from "@/shared/types";
import type { SourceStatus } from "@/shared/types";

const MIN = 60_000;
const NOW = Date.UTC(2026, 7, 30, 12, 0, 0); // 2026-08-30T12:00Z
const id: SourceStatus["id"] = "openrouter";

const sample = (minAgo: number, ok: boolean, latencyMs: number | null = ok ? 900 : null): UptimeSample => ({
  t: NOW - minAgo * MIN,
  ok,
  latencyMs,
});

describe("mergeSample", () => {
  it("appends samples and prunes the 24h window", () => {
    const old = 25 * 60; // 25h ago — outside the recent window
    let entry = mergeSample(undefined, sample(old, true), NOW);
    // The out-of-window sample is pruned immediately on merge.
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

  it("rolls daily buckets and counts ok→fail transitions as incidents", () => {
    let entry = mergeSample(undefined, sample(30, true), NOW);
    entry = mergeSample(entry, sample(20, false), NOW);
    entry = mergeSample(entry, sample(10, false), NOW);
    entry = mergeSample(entry, sample(0, true), NOW);

    expect(entry.daily).toHaveLength(1);
    const bucket = entry.daily[0]!;
    expect(bucket).toMatchObject({ day: "2026-08-30", total: 4, ok: 2, incidents: 1, latencyN: 2 });
  });

  it("counts a failing first sample as an incident (outage start unknown)", () => {
    const entry = mergeSample(undefined, sample(5, false), NOW);
    expect(entry.daily[0]!.incidents).toBe(1);
    expect(entry.daily[0]!.total).toBe(1);
  });

  it("prunes daily buckets beyond the 90-day retention", () => {
    const stale: DayBucket = { day: "2026-05-01", total: 10, ok: 10, latencySum: 0, latencyN: 0, incidents: 0 };
    const entry = mergeSample({ recent: [], daily: [stale] }, sample(0, true), NOW);
    expect(entry.daily.some((b) => b.day === "2026-05-01")).toBe(false);
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

// -- probe aggregation & status derivation --------------------------------------

const target = (id: SourceStatus["id"]): ProbeTarget => ({ id, url: `https://upstream.test/${id}` });
const okProbe = (status = 200, latencyMs = 500) => ({ ok: true, status, latencyMs, error: null });
const failProbe = (error = "network error") => ({ ok: false, status: null, latencyMs: null, error });

describe("aggregateProbes", () => {
  it("any successful probe makes the source healthy; the last success donates status/latency", () => {
    const agg = aggregateProbes([
      { target: target("news"), probe: okProbe(200, 300) },
      { target: target("news"), probe: failProbe() },
      { target: target("news"), probe: okProbe(204, 700) },
    ]);
    expect(agg.get("news")).toEqual({ ok: true, status: 204, latencyMs: 700, error: null });
  });

  it("summarizes total failure across multiple feeds as x/y failed", () => {
    const agg = aggregateProbes([
      { target: target("news"), probe: failProbe("HTTP 503") },
      { target: target("news"), probe: failProbe("timeout") },
    ]);
    expect(agg.get("news")).toEqual({ ok: false, status: null, latencyMs: null, error: "2/2 feeds failed" });
  });

  it("keeps the single-feed error message when only one target exists", () => {
    const agg = aggregateProbes([{ target: target("openrouter"), probe: failProbe("HTTP 500") }]);
    expect(agg.get("openrouter")!.error).toBe("HTTP 500");
  });
});

describe("statusFromStore", () => {
  it("folds the newest sample per source into the status payload", () => {
    const store: HistoryStore = {
      sources: { openrouter: { recent: [sample(10, true, 800), sample(4, false)], daily: [] } },
    };
    const { sources, checkedAt } = statusFromStore(store, NOW);
    const or = sources.find((s) => s.id === "openrouter")!;
    expect(or).toMatchObject({ ok: false, latencyMs: null, error: "probe failed" });
    expect(or.checkedAt).toBe(new Date(NOW - 4 * MIN).toISOString());
    // Sources without any history report as down with a note instead of going missing.
    const hf = sources.find((s) => s.id === "huggingface")!;
    expect(hf).toMatchObject({ ok: false, error: "no samples yet" });
    expect(checkedAt).toBe(new Date(NOW - 4 * MIN).toISOString());
  });

  it("carries the sample's HTTP status when healthy", () => {
    const entry: HistoryStore = {
      sources: { huggingface: { recent: [{ t: NOW, ok: true, latencyMs: 120, status: 200, error: null }], daily: [] } },
    };
    const { sources } = statusFromStore(entry, NOW);
    expect(sources.find((s) => s.id === "huggingface")).toMatchObject({ ok: true, status: 200, error: null });
  });

  it("reports an empty store as all-down with placeholder timestamps", () => {
    const { sources, checkedAt } = statusFromStore({ sources: {} }, NOW);
    expect(sources).toHaveLength(4);
    expect(sources.every((s) => s.ok === false && s.error === "no samples yet")).toBe(true);
    expect(checkedAt).toBe(new Date(NOW).toISOString());
  });
});

describe("deriveEvents", () => {
  it("pairs a down event with its duration and an up event on recovery", () => {
    const events = deriveEvents(id, [sample(30, true), sample(20, false), sample(10, false), sample(0, true)]);
    expect(events).toEqual([
      { id, type: "down", at: new Date(NOW - 20 * MIN).toISOString(), durationMin: 20 },
      { id, type: "up", at: new Date(NOW).toISOString(), durationMin: null },
    ]);
  });

  it("keeps durationMin null for an ongoing outage", () => {
    const events = deriveEvents(id, [sample(30, true), sample(10, false), sample(5, false)]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "down", durationMin: null });
  });

  it("treats a failing first sample as an ongoing outage", () => {
    const events = deriveEvents(id, [sample(10, false), sample(0, false)]);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("down");
  });

  it("emits nothing for a fully healthy window", () => {
    expect(deriveEvents(id, [sample(10, true), sample(0, true)])).toHaveLength(0);
  });
});

describe("buildHistoryPayload", () => {
  it("reports null uptimes for an empty store and marks the source down", () => {
    const store: HistoryStore = { sources: {} };
    const payload = buildHistoryPayload(store, { firstLaunchAt: new Date(NOW).toISOString(), uptimeMs: 0 }, NOW);
    expect(payload.sources).toHaveLength(4);
    const or = payload.sources.find((s) => s.id === id)!;
    expect(or).toMatchObject({ uptime24h: null, uptime7d: null, uptime90d: null, avgLatency24h: null, ok: false });
    expect(payload.events).toHaveLength(0);
    expect(payload.uptimeMs).toBe(0);
    expect(payload.generatedAt).toBe(new Date(NOW).toISOString());
  });

  it("derives recent uptime from samples and 7d/90d from daily buckets", () => {
    const recent: UptimeSample[] = [sample(20, true), sample(10, true), sample(1, false)];
    const daily: DayBucket[] = [
      { day: "2026-08-24", total: 100, ok: 99, latencySum: 0, latencyN: 0, incidents: 1 },
      { day: "2026-08-29", total: 100, ok: 100, latencySum: 0, latencyN: 0, incidents: 0 },
    ];
    const payload = buildHistoryPayload(
      { sources: { [id]: { recent, daily } } },
      { firstLaunchAt: new Date(NOW).toISOString(), uptimeMs: 5 * MIN },
      NOW,
    );
    const or = payload.sources.find((s) => s.id === id)!;
    expect(or.uptime24h).toBeCloseTo(2 / 3);
    expect(or.uptime7d).toBe(199 / 200);
    expect(or.uptime90d).toBeCloseTo(199 / 200);
    expect(or.ok).toBe(false);
    expect(or.checkedAt).toBe(new Date(NOW - MIN).toISOString());
    expect(payload.uptimeMs).toBe(5 * MIN);
  });

  it("reports uptime90d as null (not 0%) when daily buckets carry no samples", () => {
    const emptyBucket: DayBucket = { day: "2026-08-30", total: 0, ok: 0, latencySum: 0, latencyN: 0, incidents: 0 };
    const payload = buildHistoryPayload(
      { sources: { [id]: { recent: [], daily: [emptyBucket] } } },
      { firstLaunchAt: new Date(NOW).toISOString(), uptimeMs: 0 },
      NOW,
    );
    expect(payload.sources.find((s) => s.id === id)!.uptime90d).toBeNull();
  });
});


describe("getStatusHistory sample-on-read", () => {
  function buildCtx(kvStore: Map<string, string>, probeOk = true): AppContext {
    return {
      cache: {} as AppContext["cache"],
      http: {
        probe: async () => ({ ok: probeOk, status: probeOk ? 200 : 503, latencyMs: probeOk ? 500 : null, error: null }),
      } as unknown as AppContext["http"],
      kv: {
        get: async (key: string) => kvStore.get(key) ?? null,
        put: async (key: string, value: string) => {
          kvStore.set(key, value);
        },
      } as AppContext["kv"],
      log: () => {},
    };
  }

  it("skips sampling while the lock is held instead of racing the writer", async () => {
    const kvStore = new Map<string, string>([["status:history:lock", "1"]]);
    const payload = await getStatusHistory(buildCtx(kvStore));
    // No store written and every source reports as down (placeholders, not real probes).
    expect(kvStore.has("status:history:v1")).toBe(false);
    expect(payload.sources.every((s) => s.ok === false)).toBe(true);
  });

  it("samples on first read when the store is empty, so the page is never falsely 'down'", async () => {
    const kvStore = new Map<string, string>();
    const payload = await getStatusHistory(buildCtx(kvStore));
    expect(kvStore.has("status:history:v1")).toBe(true);
    const or = payload.sources.find((s) => s.id === "openrouter")!;
    expect(or.ok).toBe(true);
    expect(or.checkedAt).not.toBeNull();
    expect(or.uptime24h).toBe(1);
  });

  it("skips sampling while the newest sample is inside the interval", async () => {
    const kvStore = new Map<string, string>();
    const ctx = buildCtx(kvStore);
    await getStatusHistory(ctx);
    const snapshot = kvStore.get("status:history:v1")!;
    // An immediate second read is fresh enough — the stored payload must not grow.
    await getStatusHistory(ctx);
    expect(kvStore.get("status:history:v1")).toBe(snapshot);
  });

  it("records a failed probe as a down sample when probes fail", async () => {
    const kvStore = new Map<string, string>();
    const payload = await getStatusHistory(buildCtx(kvStore, false));
    const or = payload.sources.find((s) => s.id === "openrouter")!;
    expect(or.ok).toBe(false);
    expect(or.latencyMs).toBeNull();
    expect(or.uptime24h).toBe(0);
  });
});
