import { describe, expect, it, vi } from "vitest";
import {
  backfillFromMeta,
  compact,
  compactOmniscienceEnrich,
  computeBlendPrice,
} from "@/server/sources/artificial-analysis/mapping";
import { mergeBySlug } from "@/server/sources/artificial-analysis/merge";
import { mapEntry, type RawEntry } from "@/server/sources/artificial-analysis/text-to-image";
import {
  categoryFrom,
  creatorFromSlug,
  mapModels,
  normalizeModelKey,
  parseChange,
  titleFromSlug,
  type ModelRow,
  type PricingEntry,
} from "@/server/sources/openrouter/mapping";
import { getUptime } from "@/server/sources/uptime";
import { mergeSample } from "./status-history/merge";
import { deriveEvents } from "./status-history/events";
import { buildHistoryPayload } from "./status-history/payload";
import { uptimeRatio, avgLatency } from "./status-history/utils";
import { getStatusHistory, statusFromStore } from "./status-history/store";
import type { HistoryStore } from "./status-history/types";
import { aggregateProbes, type ProbeTarget } from "@/server/sources/probe";
import type { AppContext } from "@/server/context";
import { BENCHMARK_KEYS } from "@/shared/config";
import type { DayBucket, UptimeSample } from "@/shared/types";
import type { SourceStatus } from "@/shared/types";

// Consolidated tests for the upstream data sources: Artificial Analysis mapping,
// OpenRouter mapping, the uptime KV helper and the status-history store.

// -- artificial-analysis mapping ----------------------------------------------

function rawModel(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "m1",
    slug: "gpt-5",
    name: "GPT-5",
    intelligenceIndex: 80,
    isOpenWeights: false,
    isReasoning: true,
    creator: { name: "OpenAI", color: "#000000" },
    analystAgent: 0.72,
    terminalbenchV21: 0.8,
    scicode: 0.6,
    price1mInputTokens: 1.5,
    price1mOutputTokens: 6,
    cacheHitPrice: 0.75,
    timescaleData: { medianOutputSpeed: 120 },
    releaseDate: "2026-08-07",
    inputModalityText: true,
    outputModalityText: true,
    omniscience: 0.9,
    omniscienceBreakdown: { accuracy: 0.88, attemptRate: 0.7, hallucinationRate: 0.1 },
    ...over,
  };
}

describe("compact", () => {
  it("projects the raw upstream record onto the public model shape", () => {
    const m = compact(rawModel());
    expect(m).toMatchObject({
      id: "m1",
      slug: "gpt-5",
      name: "GPT-5",
      model_creators: { name: "OpenAI", color: "#000000" },
      intelligence_index: 80,
      is_reasoning: true,
      is_open_weights: false,
      agentic_index: 72,
      coding_index: 70,
      release_date: "2026-08-07",
      pricing: { input: 1.5, output: 6, cache_hit: 0.75 },
      speed: { median_output_speed: 120 },
    });
    expect(m.omniscience_breakdown?.total).toEqual({
      accuracy: 88,
      attempt_rate: 70,
      hallucination_rate: 10,
      omniscience: 90,
    });
  });

  it("normalizes sub-1 fractions to percents and keeps percents as-is", () => {
    expect(compact(rawModel({ analystAgent: 85 })).agentic_index).toBe(85);
    expect(compact(rawModel({ analystAgent: 0.5 })).agentic_index).toBe(50);
  });

  it("averages coding sub-scores only when at least one is present", () => {
    expect(compact(rawModel({ terminalbenchV21: null })).coding_index).toBe(60);
    expect(compact(rawModel({ terminalbenchV21: null, scicode: null })).coding_index).toBeNull();
  });

  it("exposes every benchmark key with null for missing values", () => {
    const m = compact(rawModel());
    expect(Object.keys(m.benchmarks!)).toHaveLength(BENCHMARK_KEYS.length);
    expect(m.benchmarks!.gpqa).toBeNull();
    expect(compact(rawModel({ gpqa: 85 })).benchmarks!.gpqa).toBe(85);
  });

  it("drops invalid release dates", () => {
    expect(compact(rawModel({ releaseDate: "not-a-date" })).release_date).toBeUndefined();
  });
});

describe("compactOmniscienceEnrich", () => {
  it("extracts the overlay fields keyed by slug", () => {
    expect(compactOmniscienceEnrich(rawModel())).toMatchObject({ slug: "gpt-5", omniscience: 0.9 });
    expect(compactOmniscienceEnrich(rawModel()).omniscienceBreakdown).toEqual({
      accuracy: 0.88,
      attemptRate: 0.7,
      hallucinationRate: 0.1,
    });
  });
});

describe("mergeBySlug", () => {
  const catalog = [
    { slug: "a", name: "A", intelligenceIndex: 1 },
    { slug: "b", name: "B" },
    { slug: "", name: "NoSlug" },
  ];

  it("overlays enrichment fields and skips enrichments without a catalog match", () => {
    const merged = mergeBySlug(catalog, [
      { slug: "a", medianOutputSpeed: 5 },
      { slug: "ghost", name: "Ghost" },
    ]);
    expect(merged.map((m) => m.slug)).toEqual(["a", "b"]);
    expect(merged[0]!.medianOutputSpeed).toBe(5);
    expect(merged[0]!.intelligenceIndex).toBe(1);
  });

  it("deep-merges omniscience breakdown objects", () => {
    const merged = mergeBySlug(
      [{ slug: "a", name: "A", omniscienceBreakdown: { accuracy: 1, attemptRate: 2 } }],
      [{ slug: "a", omniscienceBreakdown: { hallucinationRate: 3 } }],
    );
    expect(merged[0]!.omniscienceBreakdown).toEqual({ accuracy: 1, attemptRate: 2, hallucinationRate: 3 });
  });

  it("drops catalog entries without slug or name", () => {
    expect(mergeBySlug([{ slug: "x" }, { name: "y" }])).toEqual([]);
  });

  it("does not let enrichment nulls clobber catalog values", () => {
    const merged = mergeBySlug(
      [{ slug: "a", name: "A", intelligenceIndex: 1, omniscience: 80 }],
      [{ slug: "a", omniscience: null, medianOutputSpeed: null }],
    );
    const a = merged[0]!;
    expect(a.intelligenceIndex).toBe(1);
    expect(a.omniscience).toBe(80);
    expect("medianOutputSpeed" in a).toBe(false);
  });
});

describe("normalizeModelKey", () => {
  it("collapses variant labels, effort qualifiers and separators into one key", () => {
    expect(normalizeModelKey("DeepSeek V4 Pro 0813 (Reasoning, Max Effort)")).toBe("deepseekv4pro0813");
    expect(normalizeModelKey("deepseek/deepseek-v4-pro-0813")).toBe("deepseekv4pro0813");
    expect(normalizeModelKey("DeepSeek: DeepSeek V4 Pro 0813 (batch)")).toBe("deepseekv4pro0813");
    expect(normalizeModelKey("Claude Opus 5 (Adaptive Reasoning, Xhigh Effort)")).toBe("claudeopus5");
    expect(normalizeModelKey("claude-opus-5-xhigh")).toBe("claudeopus5");
    expect(normalizeModelKey("Anthropic: Claude Opus 5")).toBe("claudeopus5");
  });

  it("keeps distinct models distinct", () => {
    expect(normalizeModelKey("GLM-5.3 (max)")).not.toBe(normalizeModelKey("GLM-5.3-Flash"));
    expect(normalizeModelKey("GPT-5.6 Terra (max)")).not.toBe(normalizeModelKey("GPT-5.6 Luna (max)"));
  });
});

describe("backfillFromMeta", () => {
  it("fills only null values via loose key matching and reports the filled count", () => {
    const models = [
      { slug: "a", name: "Model A", agentic_index: null, context_window_tokens: null },
      { slug: "b", name: "Model B", agentic_index: 40, context_window_tokens: 1000 },
      { slug: "c", name: "Model C", agentic_index: null, context_window_tokens: null },
    ] as import("@/shared/types").ArtificialAnalysisModel[];
    const meta = {
      [normalizeModelKey("Model A")]: { agenticIndex: 55.4, contextLength: 262144 },
      [normalizeModelKey("Model B")]: { agenticIndex: 99, contextLength: 1 },
      [normalizeModelKey("Unknown")]: { agenticIndex: 1 },
    };
    const filled = backfillFromMeta(models, meta);
    expect(filled).toBe(2);
    expect(models[0]).toMatchObject({ agentic_index: 55.4, context_window_tokens: 262144 });
    // First-party values must never be overwritten.
    expect(models[1]).toMatchObject({ agentic_index: 40, context_window_tokens: 1000 });
    // No meta match → untouched.
    expect(models[2]).toMatchObject({ agentic_index: null, context_window_tokens: null });
  });

  it("scales sub-1 fraction agentic values to the 0-100 scale", () => {
    const models = [
      { slug: "a", name: "Model A", agentic_index: null, context_window_tokens: null },
    ] as import("@/shared/types").ArtificialAnalysisModel[];
    backfillFromMeta(models, { [normalizeModelKey("Model A")]: { agenticIndex: 0.5 } });
    expect(models[0]!.agentic_index).toBe(50);
  });
});

describe("computeBlendPrice", () => {
  it("computes the 7:2:1 cache/input/output weighted blend", () => {
    // Matches records verified against the live AA cache.
    expect(computeBlendPrice({ input: 5, output: 25, cache_hit: 0.5 })).toBeCloseTo(3.85, 5);
    expect(computeBlendPrice({ input: 1.4, output: 4.4, cache_hit: 0.26 })).toBeCloseTo(0.902, 5);
  });

  it("falls back to the input price when no cache tier exists", () => {
    expect(computeBlendPrice({ input: 2, output: 6 })).toBe(2.4);
    expect(computeBlendPrice({ input: 2, output: 6, cache_hit: null })).toBe(2.4);
  });

  it("returns null when input or output pricing is missing", () => {
    expect(computeBlendPrice({})).toBeNull();
    expect(computeBlendPrice({ input: 1 })).toBeNull();
    expect(computeBlendPrice({ input: null, output: 2 })).toBeNull();
  });
});

describe("backfillFromMeta blended price", () => {
  it("backfills the blend from the model's own AA pricing even without an OpenRouter match", () => {
    const models = [
      { slug: "a", name: "Motif 3", blended_price: null, pricing: { input: 3, output: 15, cache_hit: 0.3 } },
    ] as import("@/shared/types").ArtificialAnalysisModel[];
    const filled = backfillFromMeta(models, {});
    expect(filled).toBe(1);
    expect(models[0]!.blended_price).toBeCloseTo(2.31, 5);
  });

  it("prefers first-party AA pricing over the OpenRouter directory for the blend", () => {
    const models = [
      { slug: "a", name: "Model A", blended_price: null, pricing: { input: 5, output: 25, cache_hit: 0.5 } },
    ] as import("@/shared/types").ArtificialAnalysisModel[];
    const meta = { [normalizeModelKey("Model A")]: { pricing: { input: 1, output: 1, cacheHit: 0.1 } } };
    backfillFromMeta(models, meta);
    expect(models[0]!.blended_price).toBeCloseTo(3.85, 5);
  });

  it("derives the blend from OpenRouter directory pricing converted to $/1M", () => {
    const models = [
      { slug: "a", name: "Model A", blended_price: null },
    ] as import("@/shared/types").ArtificialAnalysisModel[];
    const meta = { [normalizeModelKey("Model A")]: { pricing: { input: 2, output: 6, cacheHit: 0.5 } } };
    backfillFromMeta(models, meta);
    expect(models[0]!.blended_price).toBeCloseTo(1.35, 5);
  });
});

describe("mapEntry (text-to-image)", () => {
  const base: RawEntry = {
    id: "t2i-1",
    slug: "flux",
    name: "FLUX",
    overallRank: 1,
    elos: [{ elo: 1100, ciDelta: 10, appearances: 12, winRate: 0.5 }],
    creator: { name: "BFL", color: "#111111" },
    pricePer1kImages: 0.025,
  };

  it("maps a full entry with the elo interval", () => {
    expect(mapEntry(base)).toMatchObject({
      id: "t2i-1",
      slug: "flux",
      name: "FLUX",
      rank: 1,
      elo: 1100,
      eloLower: 1090,
      eloUpper: 1110,
      appearances: 12,
      creatorName: "BFL",
      pricePer1kImages: 0.025,
    });
  });

  it("falls back to overallElo when the elos list is empty", () => {
    expect(mapEntry({ ...base, elos: [], overallElo: 1050 })!.elo).toBe(1050);
  });

  it("returns null when identity or rank is missing", () => {
    expect(mapEntry({ ...base, id: null })).toBeNull();
    expect(mapEntry({ ...base, slug: null })).toBeNull();
    expect(mapEntry({ ...base, overallRank: 0 })).toBeNull();
  });
});

// -- openrouter mapping ---------------------------------------------------------

function row(over: Partial<ModelRow> = {}): ModelRow {
  return {
    date: "2026-08-01",
    model_permaslug: "openai/gpt-5",
    variant: "std",
    variant_permaslug: "openai/gpt-5",
    total_completion_tokens: 50,
    total_prompt_tokens: 100,
    total_native_tokens_reasoning: 10,
    count: 2,
    image_output_requests: 0,
    video_output_seconds: 0,
    change: 1,
    ...over,
  };
}

const pricing = new Map<string, PricingEntry>([["openai/gpt-5", { prompt: 1, completion: 2, input_cache_read: 0.5 }]]);

describe("parseChange", () => {
  it("accepts numbers and numeric strings, rejects everything else", () => {
    expect(parseChange(1)).toBe(1);
    expect(parseChange("1.5")).toBe(1.5);
    expect(parseChange("")).toBeNull();
    expect(parseChange(" ")).toBeNull();
    expect(parseChange("abc")).toBeNull();
    expect(parseChange(null)).toBeNull();
  });
});

describe("creatorFromSlug / titleFromSlug / categoryFrom", () => {
  it("maps known creators and title-cases unknown orgs", () => {
    expect(creatorFromSlug("openai/gpt-5")).toBe("OpenAI");
    expect(creatorFromSlug("meta-llama/llama-4")).toBe("Meta");
    expect(creatorFromSlug("some-org/model_x")).toBe("Some Org");
  });

  it("derives a display title from the permaslug", () => {
    expect(titleFromSlug("openai/gpt-5")).toBe("GPT 5");
    expect(titleFromSlug("solo-model")).toBe("Solo Model");
    // Version tokens keep authored casing instead of uppercasing ("GPT 4O").
    expect(titleFromSlug("openai/gpt-4o")).toBe("GPT 4o");
    expect(titleFromSlug("meta-llama/llama-3-405b")).toBe("Llama 3 405b");
  });

  it("classifies category from slug and name", () => {
    expect(categoryFrom("deepseek/deepseek-coder-v2", "DeepSeek Coder V2")).toBe("coding");
    expect(categoryFrom("deepseek/deepseek-r1", "DeepSeek R1")).toBe("reasoning");
    expect(categoryFrom("qwen/qwen3-max", "Qwen3 Max")).toBe("general");
  });
});

describe("mapModels", () => {
  it("aggregates rows by permaslug, keeping the latest change, and attaches pricing", () => {
    const models = mapModels([row(), row({ date: "2026-08-02", total_prompt_tokens: 10, change: null })], pricing);
    expect(models).toHaveLength(1);
    const m = models[0]!;
    expect(m).toMatchObject({
      rank: 1,
      id: "openai/gpt-5",
      name: "GPT 5",
      creator: "OpenAI",
      promptTokens: 110,
      completionTokens: 100,
      totalTokens: 210,
      requestCount: 4,
      reasoningTokens: 20,
      change: 1,
      pricing: pricing.get("openai/gpt-5"),
    });
    expect(m.isFree).toBe(false);
  });

  it("marks free models and leaves pricing undefined when absent", () => {
    const free = new Map([["a/b", { prompt: 0, completion: 0, input_cache_read: 0 }]]);
    const [m] = mapModels([row({ model_permaslug: "a/b", variant_permaslug: "a/b" })], free);
    expect(m!.isFree).toBe(true);

    const [noPricing] = mapModels([row({ model_permaslug: "x/y", variant_permaslug: "x/y" })], new Map());
    expect(noPricing!.pricing).toBeUndefined();
    expect(noPricing!.isFree).toBeUndefined();
  });

  it("sorts by total tokens descending and ranks sequentially", () => {
    const models = mapModels(
      [
        row({ model_permaslug: "a/small", variant_permaslug: "a/small", total_prompt_tokens: 1 }),
        row({ model_permaslug: "b/big", variant_permaslug: "b/big", total_prompt_tokens: 999 }),
      ],
      new Map(),
    );
    expect(models.map((m) => m.id)).toEqual(["b/big", "a/small"]);
    expect(models.map((m) => m.rank)).toEqual([1, 2]);
  });

  it("merges variant rows of one model into a single entry with dominant-variant pricing", () => {
    const variantPricing = new Map<string, PricingEntry>([
      ["a/b:standard", { prompt: 2, completion: 3, input_cache_read: 1 }],
      ["a/b:free", { prompt: 0, completion: 0, input_cache_read: 0 }],
    ]);
    const models = mapModels(
      [
        row({
          model_permaslug: "a/b",
          variant: "free",
          variant_permaslug: "a/b:free",
          total_prompt_tokens: 5,
          count: 1,
        }),
        row({
          model_permaslug: "a/b",
          variant: "standard",
          variant_permaslug: "a/b:standard",
          total_prompt_tokens: 900,
          count: 2,
          change: 0.5,
        }),
      ],
      variantPricing,
    );
    expect(models).toHaveLength(1);
    const m = models[0]!;
    expect(m.id).toBe("a/b");
    expect(m.promptTokens).toBe(905);
    expect(m.requestCount).toBe(3);
    expect(m.variant).toBe("standard");
    expect(m.pricing).toEqual(variantPricing.get("a/b:standard"));
    expect(m.isFree).toBe(false);
  });
});

// -- uptime ---------------------------------------------------------------------

function fakeKV(initial?: Record<string, string>) {
  const store = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    store,
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string): Promise<void> {
      if (this.failPut) throw new Error("kv write failed");
      store.set(key, value);
    },
    failPut: false,
  };
}

function buildCtx(kv: unknown): AppContext {
  return {
    cache: {} as AppContext["cache"],
    http: {} as AppContext["http"],
    kv: kv as AppContext["kv"],
    log: vi.fn(),
  };
}

describe("getUptime", () => {
  it("persists first launch on the first call and reports ~zero uptime", async () => {
    const kv = fakeKV();
    const before = Date.now();
    const { firstLaunchAt, uptimeMs } = await getUptime(buildCtx(kv));

    const firstLaunchMs = Date.parse(firstLaunchAt);
    expect(firstLaunchMs).toBeGreaterThanOrEqual(before);
    expect(uptimeMs).toBeLessThanOrEqual(Date.now() - before + 5);
    expect(kv.store.get("uptime:first-launch")).toBe(String(firstLaunchMs));
  });

  it("reuses the persisted first-launch timestamp on later calls", async () => {
    const persisted = Date.now() - 86_400_000;
    const kv = fakeKV({ "uptime:first-launch": String(persisted) });
    const { firstLaunchAt, uptimeMs } = await getUptime(buildCtx(kv));

    expect(Date.parse(firstLaunchAt)).toBe(persisted);
    expect(uptimeMs).toBeGreaterThanOrEqual(86_400_000);
  });

  it("degrades to an ephemeral first launch when KV writes fail", async () => {
    const kv = fakeKV();
    kv.failPut = true;
    const { firstLaunchAt, uptimeMs } = await getUptime(buildCtx(kv));

    expect(Number.isFinite(Date.parse(firstLaunchAt))).toBe(true);
    expect(uptimeMs).toBeGreaterThanOrEqual(0);
  });
});

// -- status-history --------------------------------------------------------------

const MIN = 60_000;
const NOW = Date.UTC(2026, 7, 30, 12, 0, 0); // 2026-08-30T12:00Z
const historyId: SourceStatus["id"] = "openrouter";

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
    const events = deriveEvents(historyId, [sample(30, true), sample(20, false), sample(10, false), sample(0, true)]);
    expect(events).toEqual([
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
});

describe("buildHistoryPayload", () => {
  it("reports null uptimes for an empty store and marks the source down", () => {
    const store: HistoryStore = { sources: {} };
    const payload = buildHistoryPayload(store, { firstLaunchAt: new Date(NOW).toISOString(), uptimeMs: 0 }, NOW);
    expect(payload.sources).toHaveLength(4);
    const or = payload.sources.find((s) => s.id === historyId)!;
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
      { sources: { [historyId]: { recent, daily } } },
      { firstLaunchAt: new Date(NOW).toISOString(), uptimeMs: 5 * MIN },
      NOW,
    );
    const or = payload.sources.find((s) => s.id === historyId)!;
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
      { sources: { [historyId]: { recent: [], daily: [emptyBucket] } } },
      { firstLaunchAt: new Date(NOW).toISOString(), uptimeMs: 0 },
      NOW,
    );
    expect(payload.sources.find((s) => s.id === historyId)!.uptime90d).toBeNull();
  });
});

describe("getStatusHistory sample-on-read", () => {
  function buildHistoryCtx(kvStore: Map<string, string>, probeOk = true): AppContext {
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
    const payload = await getStatusHistory(buildHistoryCtx(kvStore));
    // No store written and every source reports as down (placeholders, not real probes).
    expect(kvStore.has("status:history:v1")).toBe(false);
    expect(payload.sources.every((s) => s.ok === false)).toBe(true);
  });

  it("samples on first read when the store is empty, so the page is never falsely 'down'", async () => {
    const kvStore = new Map<string, string>();
    const payload = await getStatusHistory(buildHistoryCtx(kvStore));
    expect(kvStore.has("status:history:v1")).toBe(true);
    const or = payload.sources.find((s) => s.id === "openrouter")!;
    expect(or.ok).toBe(true);
    expect(or.checkedAt).not.toBeNull();
    expect(or.uptime24h).toBe(1);
  });

  it("skips sampling while the newest sample is inside the interval", async () => {
    const kvStore = new Map<string, string>();
    const ctx = buildHistoryCtx(kvStore);
    await getStatusHistory(ctx);
    const snapshot = kvStore.get("status:history:v1")!;
    // An immediate second read is fresh enough — the stored payload must not grow.
    await getStatusHistory(ctx);
    expect(kvStore.get("status:history:v1")).toBe(snapshot);
  });

  it("records a failed probe as a down sample when probes fail", async () => {
    const kvStore = new Map<string, string>();
    const payload = await getStatusHistory(buildHistoryCtx(kvStore, false));
    const or = payload.sources.find((s) => s.id === "openrouter")!;
    expect(or.ok).toBe(false);
    expect(or.latencyMs).toBeNull();
    expect(or.uptime24h).toBe(0);
  });
});
