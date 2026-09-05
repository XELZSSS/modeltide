import { describe, expect, it, vi } from "vitest";
import { backfillFromMeta, compact, compactOmniscienceEnrich, parseChangelogModels } from "@/server/sources/artificial-analysis";
import { mergeBySlug, mapEntry, type RawEntry } from "@/server/sources/artificial-analysis";
import {
  categoryFrom,
  creatorFromSlug,
  mapModels,
  parseChange,
  titleFromSlug,
  type ModelRow,
  type PricingEntry,
} from "@/server/sources/openrouter";
import { computeBlendPrice, normalizeModelKey } from "@/shared/utils";
import { getModels } from "@/server/sources/huggingface";
import { CacheService, type ProbeResult } from "@/server/infra";
import {
  mergeSample,
  deriveEvents,
  buildHistoryPayload,
  uptimeRatio,
  avgLatency,
  getStatusHistory,
  readStore,
  getUptime,
  aggregateProbes,
  buildTargets,
  type HistoryStore,
  type ProbeTarget,
} from "./status-history";
import {
  BENCHMARK_KEYS,
  DEFAULT_TTL_MS,
  normalizeModelLimit,
  PARTIAL_FAIL_TTL_MS,
  SOURCE_IDS,
  upstreamConfig,
} from "@/shared/config";
import type { AppContext } from "@/server/context";
import type { ArtificialAnalysisModel, DayBucket, SourceStatus, UptimeSample } from "@/shared/types";
import {
  parseAnthropicPricing,
  parseDeepSeekPricing,
  parseGooglePricing,
  parseKimiPricing,
  parseMistralPricing,
  parseOpenAiPricing,
} from "@/server/sources/official-pricing";
import { parseArenaPage, parseArenaRow } from "@/server/sources/arena";
import {
  buildWeightsIndex,
  isClosedChangelogRelease,
  matchesClosedRule,
  toClosedReleases,
} from "@/server/sources/closed-releases";
import type { ChangelogModel } from "@/server/sources/artificial-analysis";

// Consolidated tests for the upstream data sources: Artificial Analysis
// mapping, OpenRouter mapping, official-pricing parsers, Arena/changelog feeds,
// Hugging Face TTL behavior and the status-history store.
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
  const aaModel = (over: Record<string, unknown> = {}): ArtificialAnalysisModel =>
    ({ slug: "a", name: "Model A", ...over }) as ArtificialAnalysisModel;

  it("fills only null values via loose key matching and reports the filled count", () => {
    const models = [
      aaModel({ agentic_index: null, context_window_tokens: null }),
      aaModel({ slug: "b", name: "Model B", agentic_index: 40, context_window_tokens: 1000 }),
      aaModel({ slug: "c", name: "Model C", agentic_index: null, context_window_tokens: null }),
    ];
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
    const models = [aaModel({ agentic_index: null, context_window_tokens: null })];
    backfillFromMeta(models, { [normalizeModelKey("Model A")]: { agenticIndex: 0.5 } });
    expect(models[0]!.agentic_index).toBe(50);
  });

  it("backfills the blend from the model's own AA pricing even without an OpenRouter match", () => {
    const models = [
      aaModel({ name: "Motif 3", blended_price: null, pricing: { input: 3, output: 15, cache_hit: 0.3 } }),
    ];
    const filled = backfillFromMeta(models, {});
    expect(filled).toBe(1);
    expect(models[0]!.blended_price).toBeCloseTo(2.31, 5);
  });

  it("prefers first-party AA pricing over the OpenRouter directory for the blend", () => {
    const models = [aaModel({ blended_price: null, pricing: { input: 5, output: 25, cache_hit: 0.5 } })];
    const meta = { [normalizeModelKey("Model A")]: { pricing: { input: 1, output: 1, cacheHit: 0.1 } } };
    backfillFromMeta(models, meta);
    expect(models[0]!.blended_price).toBeCloseTo(3.85, 5);
  });

  it("derives the blend from OpenRouter directory pricing converted to $/1M", () => {
    const models = [aaModel({ blended_price: null })];
    const meta = { [normalizeModelKey("Model A")]: { pricing: { input: 2, output: 6, cacheHit: 0.5 } } };
    backfillFromMeta(models, meta);
    expect(models[0]!.blended_price).toBeCloseTo(1.35, 5);
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

const target = (id: SourceStatus["id"]): ProbeTarget => ({ id, url: `https://upstream.test/${id}` });
const okProbe = (status = 200, latencyMs = 500) => ({ ok: true, status, latencyMs, error: null });
const failProbe = (error = "network error") => ({ ok: false, status: null, latencyMs: null, error });

describe("aggregateProbes", () => {
  it("any successful probe makes the source healthy; the fastest success donates latency", () => {
    const agg = aggregateProbes([
      { target: target("news"), probe: okProbe(200, 300) },
      { target: target("news"), probe: failProbe() },
      { target: target("news"), probe: okProbe(204, 700) },
    ]);
    expect(agg.get("news")).toEqual({ ok: true, status: 200, latencyMs: 300, error: null });
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
    expect(payload.sources).toHaveLength(SOURCE_IDS.length);
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
    expect(kvStore.has("status:history:v2")).toBe(false);
    expect(payload.sources.every((s) => s.ok === false)).toBe(true);
  });

  it("samples on first read when the store is empty, so the page is never falsely 'down'", async () => {
    const kvStore = new Map<string, string>();
    const payload = await getStatusHistory(buildHistoryCtx(kvStore));
    expect(kvStore.has("status:history:v2")).toBe(true);
    const or = payload.sources.find((s) => s.id === "openrouter")!;
    expect(or.ok).toBe(true);
    expect(or.checkedAt).not.toBeNull();
    expect(or.uptime24h).toBe(1);
  });

  it("skips sampling while the newest sample is inside the interval", async () => {
    const kvStore = new Map<string, string>();
    const ctx = buildHistoryCtx(kvStore);
    await getStatusHistory(ctx);
    const snapshot = kvStore.get("status:history:v2")!;
    // An immediate second read is fresh enough — the stored payload must not grow.
    await getStatusHistory(ctx);
    expect(kvStore.get("status:history:v2")).toBe(snapshot);
  });

  it("records a failed probe as a down sample when probes fail", async () => {
    const kvStore = new Map<string, string>();
    const payload = await getStatusHistory(buildHistoryCtx(kvStore, false));
    const or = payload.sources.find((s) => s.id === "openrouter")!;
    expect(or.ok).toBe(false);
    expect(or.latencyMs).toBeNull();
    expect(or.uptime24h).toBe(0);
  });

  // Vitest 5 `vi.when`: per-argument probe behaviors without a manual
  // mockImplementation switch. NOTE: a broad `calledWith(expect.any(...))`
  // chained after a specific URL is *merged* into that behavior (behavior
  // merging) and stops matching other args — so the healthy default lives
  // in `onUnmatched` instead of a trailing catch-all behavior.
  it("marks only the failing source down when probes disagree per target", async () => {
    const kvStore = new Map<string, string>();
    const probe = vi.fn<(url: string) => Promise<ProbeResult>>();
    const openrouterUrl = `${upstreamConfig.openrouter}/api/v1/models`;
    vi.when(probe, {
      onUnmatched: () => Promise.resolve({ ok: true, status: 200, latencyMs: 500, error: null }),
    })
      .calledWith(openrouterUrl)
      .thenResolve({ ok: false, status: 503, latencyMs: null, error: "HTTP 503" });
    const ctx: AppContext = {
      cache: {} as AppContext["cache"],
      http: { probe } as unknown as AppContext["http"],
      kv: {
        get: async (key: string) => kvStore.get(key) ?? null,
        put: async (key: string, value: string) => {
          kvStore.set(key, value);
        },
      } as AppContext["kv"],
      log: () => {},
    };
    const payload = await getStatusHistory(ctx);
    const or = payload.sources.find((s) => s.id === "openrouter")!;
    expect(or.ok).toBe(false);
    expect(or.uptime24h).toBe(0);
    for (const s of payload.sources) {
      if (s.id === "openrouter") continue;
      expect(s.ok).toBe(true);
    }
    expect(probe).toHaveBeenCalledWith(openrouterUrl);
  });
});

describe("normalizeModelLimit", () => {
  it("snaps arbitrary limits to the 50/100/500 cache buckets", () => {
    expect(normalizeModelLimit(1)).toBe(50);
    expect(normalizeModelLimit(7)).toBe(50);
    expect(normalizeModelLimit(50)).toBe(50);
    expect(normalizeModelLimit(80)).toBe(100);
    expect(normalizeModelLimit(500)).toBe(500);
    expect(normalizeModelLimit(499)).toBe(500);
  });
});

describe("buildTargets", () => {
  it("samples one feed per news category instead of all 19 feeds", async () => {
    const { NEWS_CATEGORIES } = await import("@/shared/config");
    const targets = buildTargets();
    const news = targets.filter((t) => t.id === "news");
    expect(news).toHaveLength(NEWS_CATEGORIES.length);
    expect(targets).toHaveLength(4 + NEWS_CATEGORIES.length);
    expect(targets.some((t) => t.id === "arena")).toBe(true);
    // Official pricing stays a data route but is no longer status-monitored.
    expect(SOURCE_IDS).not.toContain("officialPricing");
    expect(targets.every((t) => (SOURCE_IDS as readonly string[]).includes(t.id))).toBe(true);
  });
});

describe("readStore", () => {
  it("self-heals a corrupted history entry instead of throwing", async () => {
    const deleted: string[] = [];
    const ctx = {
      kv: {
        get: async () => "truncated-json{{{",
        put: async () => {},
        delete: async (key: string) => {
          deleted.push(key);
        },
      },
    } as unknown as AppContext;
    await expect(readStore(ctx)).resolves.toEqual({ sources: {} });
    expect(deleted).toContain("status:history:v2");
  });
});

describe("getModels empty-result TTL", () => {
  function hfCtx(
    items: unknown[],
    kvStore = new Map<string, string>(),
  ): { ctx: AppContext; kvStore: Map<string, string> } {
    const kv = {
      get: async (key: string) => kvStore.get(key) ?? null,
      put: async (key: string, value: string) => {
        kvStore.set(key, value);
      },
    } as unknown as KVNamespace;
    const ctx = {
      cache: new CacheService(kv, "v1"),
      http: { json: async () => items } as unknown as AppContext["http"],
      kv,
      log: () => {},
    };
    return { ctx, kvStore };
  }

  it("caches empty results briefly so transient failures are retried soon", async () => {
    const { ctx, kvStore } = hfCtx([]);
    await getModels(ctx, { sort: "trendingScore", direction: "-1", limit: 500 });
    const envelope = JSON.parse([...kvStore.values()][0]!) as { e: number };
    expect(envelope.e - Date.now()).toBeLessThan(DEFAULT_TTL_MS);
    expect(envelope.e - Date.now()).toBeLessThanOrEqual(PARTIAL_FAIL_TTL_MS + 1000);
  });

  it("fetches with the normalized bucket limit so payload matches the cache key", async () => {
    let fetchedUrl = "";
    const kvStore = new Map<string, string>();
    const kv = {
      get: async (key: string) => kvStore.get(key) ?? null,
      put: async (key: string, value: string) => {
        kvStore.set(key, value);
      },
    } as unknown as KVNamespace;
    const ctx = {
      cache: new CacheService(kv, "v1"),
      http: {
        json: async (url: string) => {
          fetchedUrl = url;
          return [];
        },
      } as unknown as AppContext["http"],
      kv,
      log: () => {},
    };
    await getModels(ctx, { sort: "trendingScore", direction: "-1", limit: 7 });
    expect(new URL(fetchedUrl).searchParams.get("limit")).toBe("50");
  });
});
describe("parseOpenAiPricing", () => {
  it("takes the first (Standard) table and strips parenthetical qualifiers", () => {
    const md = [
      "### Standard pricing data",
      "| Model | Short context input | Short context cached input | Short context cache writes | Short context output |",
      "| --- | --- | --- | --- | --- |",
      "| gpt-5.6-luna | $0.20 | $0.02 | $0.25 | $1.20 |",
      "| gpt-5.5 (<272K context length) | $5.00 | $0.50 | - | $30.00 |",
      "| gpt-5.4-cyber | - | - | - | - |",
      "### Batch pricing data",
      "| gpt-5.6-luna | $0.10 | $0.01 | $0.125 | $0.60 |",
      "",
    ].join("\n");
    expect(parseOpenAiPricing(md)).toEqual([
      {
        id: "gpt-5.6-luna",
        name: "gpt-5.6-luna",
        provider: "OpenAI",
        input: 0.2,
        cachedInput: 0.02,
        output: 1.2,
        contextWindow: null,
      },
      {
        id: "gpt-5.5",
        name: "gpt-5.5",
        provider: "OpenAI",
        input: 5,
        cachedInput: 0.5,
        output: 30,
        contextWindow: null,
      },
    ]);
  });
});

describe("parseAnthropicPricing", () => {
  it("parses the model table and skips retired rows", () => {
    const html = [
      "<h2>Model pricing</h2><table>",
      "<tr><th>Model</th><th>Base input tokens</th><th>5m</th><th>1h</th><th>Cache hits</th><th>Output tokens</th></tr>",
      "<tr><td>Claude Opus 5</td><td>$5 / MTok</td><td>$6.25 / MTok</td><td>$10 / MTok</td><td>$0.50 / MTok</td><td>$25 / MTok</td></tr>",
      "<tr><td>Claude Opus 4.1 (<a>retired</a>)</td><td>$15 / MTok</td><td>-</td><td>-</td><td>-</td><td>$75 / MTok</td></tr>",
      "</table><h2>Cloud platform pricing</h2>",
    ].join("");
    expect(parseAnthropicPricing(html)).toEqual([
      {
        id: "claude-opus-5",
        name: "Claude Opus 5",
        provider: "Anthropic",
        input: 5,
        cachedInput: 0.5,
        output: 25,
        contextWindow: null,
      },
    ]);
  });
});

describe("parseGooglePricing", () => {
  it("takes the first Global pair per model without Lite cross-talk", () => {
    const html = [
      "<h3>Gemini 3.5 Flash-Lite</h3><p>Input (text) Global$0.30$0.30 Text output content Global$2.50$2.50</p>",
      "<h3>Gemini 3.5 Flash</h3><p>Input (text,image,video,audio) Global$1.50$3.00 Text output response Global$9.00$18.00</p>",
    ].join("");
    expect(parseGooglePricing(html)).toEqual([
      {
        id: "gemini-3.5-flash",
        name: "Gemini 3.5 Flash",
        provider: "Google",
        input: 1.5,
        cachedInput: null,
        output: 9,
        contextWindow: null,
      },
      {
        id: "gemini-3.5-flash-lite",
        name: "Gemini 3.5 Flash-Lite",
        provider: "Google",
        input: 0.3,
        cachedInput: null,
        output: 2.5,
        contextWindow: null,
      },
    ]);
  });
});

describe("parseDeepSeekPricing", () => {
  it("takes the PEAK triple per model in column order", () => {
    const html = [
      "<table><tr><td>MODEL</td><td>deepseek-v4-flash</td><td>deepseek-v4-pro</td></tr>",
      "<tr><td>CONTEXT LENGTH</td><td colspan='3'>1M</td></tr>",
      "<tr><td>PRICING</td><td>1M INPUT TOKENS(CACHE HIT)</td><td>OFF-PEAK</td>",
      "<td>$0.007</td><td>$0.022</td><td>PEAK</td><td>$0.014</td><td>$0.044</td></tr>",
      "<tr><td>1M INPUT TOKENS(CACHE MISS)</td><td>OFF-PEAK</td>",
      "<td>$0.22</td><td>$0.66</td><td>PEAK</td><td>$0.44</td><td>$1.32</td></tr>",
      "<tr><td>1M OUTPUT TOKENS</td><td>OFF-PEAK</td>",
      "<td>$0.66</td><td>$1.98</td><td>PEAK</td><td>$1.32</td><td>$3.96</td></tr></table>",
    ].join("");
    expect(parseDeepSeekPricing(html)).toEqual([
      {
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        provider: "DeepSeek",
        input: 0.44,
        cachedInput: 0.014,
        output: 1.32,
        contextWindow: 1000000,
      },
      {
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        provider: "DeepSeek",
        input: 1.32,
        cachedInput: 0.044,
        output: 3.96,
        contextWindow: 1000000,
      },
    ]);
  });
});

describe("parseMistralPricing", () => {
  it("anchors prices at known slugs and skips unknown cards", () => {
    const html = [
      "<div>GLM 5.2NewThird-party stuffInput (/M tokens) $1.4Output (/M tokens) $4.4zai-glm-5-2</div>",
      "<div>Mistral Medium 3.5OpenPerformant model.Text-to-textInput (/M tokens) $1.5Output (/M tokens) $7.5mistral-medium-latest</div>",
      "<div>CodestralPremierLow-latency coding.Text-to-textInput (/M tokens) $0.3Cached input (/M tokens) $0.03Output (/M tokens) $0.9codestral-latest</div>",
    ].join("");
    expect(parseMistralPricing(html)).toEqual([
      {
        id: "mistral-medium-latest",
        name: "Mistral Medium 3.5",
        provider: "Mistral",
        input: 1.5,
        cachedInput: null,
        output: 7.5,
        contextWindow: null,
      },
      {
        id: "codestral-latest",
        name: "Codestral",
        provider: "Mistral",
        input: 0.3,
        cachedInput: 0.03,
        output: 0.9,
        contextWindow: null,
      },
    ]);
  });
});

describe("parseKimiPricing", () => {
  it("parses rendered rows and skips highspeed variants", () => {
    const html = [
      "<table><tr><th>Model</th><th>Unit</th><th>Hit</th><th>Miss</th><th>Out</th><th>Ctx</th></tr>",
      "<tr><td>kimi-k3</td><td>1M tokens</td><td>$0.30</td><td>$3.00</td><td>$15.00</td><td>1,048,576 tokens</td></tr>",
      "<tr><td>kimi-k2.7-code-highspeed</td><td>1M tokens</td><td>$0.38</td><td>$1.90</td><td>$8.00</td><td>262,144 tokens</td></tr>",
      "</table>",
    ].join("");
    expect(parseKimiPricing(html)).toEqual([
      {
        id: "kimi-k3",
        name: "Kimi K3",
        provider: "Kimi",
        input: 3,
        cachedInput: 0.3,
        output: 15,
        contextWindow: 1048576,
      },
    ]);
  });
});

const ARENA_ROW = `<tr><td>1</td><td>16</td><td><span title=claude-fable-5>Anthropic claude-fable-5</span></td><td><span>1507</span></td><td><span>27,189</span></td><td>$10 / $50</td><td>1M</td></tr>`;
const ARENA_HEADER = `<tr><th>Rank</th><th>Spread</th><th>Model</th><th>Score</th><th>Votes</th><th>Price</th><th>Context</th></tr>`;

describe("parseArenaRow", () => {
  it("parses a full leaderboard row", () => {
    expect(parseArenaRow(ARENA_ROW.replace(/^<tr>|<\/tr>$/g, ""))).toEqual({
      rank: 1,
      id: "claude-fable-5",
      name: "Anthropic claude-fable-5",
      creator: "Anthropic",
      score: 1507,
      votes: 27189,
      preliminary: false,
      priceInput: 10,
      priceOutput: 50,
      contextTokens: 1000000,
    });
  });

  it("handles live row shapes (locale vote suffix, ± score, N/A price)", () => {
    const inner =
      "<td>19</td><td>19</td><td><span>claude-opus-4-7-highAnthropic · Proprietary</span></td>" +
      "<td><span>1552±6</span></td><td><span>17,176票</span></td><td>N/A</td><td>N/A</td>";
    expect(parseArenaRow(inner)).toEqual({
      rank: 19,
      id: "claude-opus-4-7-highAnthropic",
      name: "claude-opus-4-7-highAnthropic · Proprietary",
      creator: "Anthropic",
      score: 1552,
      votes: 17176,
      preliminary: false,
      priceInput: null,
      priceOutput: null,
      contextTokens: null,
    });
  });

  it("flags low-vote rows carrying the Preliminary badge", () => {
    const inner =
      "<td>7</td><td>139</td><td><span title=gemini-3.8-flash-high>Gemini gemini-3.8-flash-high</span></td>" +
      '<td><span>1537±16</span><span class="badge">Preliminary</span></td><td><span>1,456</span></td>' +
      "<td>$0.75 / $3.75</td><td>1M</td>";
    expect(parseArenaRow(inner)).toEqual({
      rank: 7,
      id: "gemini-3.8-flash-high",
      name: "Gemini gemini-3.8-flash-high",
      creator: "Google",
      score: 1537,
      votes: 1456,
      preliminary: true,
      priceInput: 0.75,
      priceOutput: 3.75,
      contextTokens: 1000000,
    });
  });

  it("rejects header rows and rows without rank", () => {
    expect(parseArenaRow(ARENA_HEADER.replace(/^<tr>|<\/tr>$/g, ""))).toBeNull();
    expect(parseArenaRow("<td>no rank here</td><td>x</td>")).toBeNull();
  });
});

describe("parseArenaPage", () => {
  it("collects data rows, dedupes by id and sorts by rank", () => {
    const html = `<table><tbody>${ARENA_HEADER}${ARENA_ROW}${ARENA_ROW.replace(">1<", ">2<")}</tbody></table>`;
    const entries = parseArenaPage(html);
    // Same id twice → deduped to one row.
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ rank: 1, id: "claude-fable-5" });
  });

  it("returns an empty list when no data rows exist", () => {
    expect(parseArenaPage(`<table><tbody>${ARENA_HEADER}</tbody></table>`)).toEqual([]);
  });
});

function clModel(over: Partial<ChangelogModel> = {}): ChangelogModel {
  return {
    slug: "claude-opus-4-5-thinking",
    name: "Claude Opus 4.5 (Reasoning)",
    releaseSlug: "claude-opus-4-5",
    releaseName: "Claude Opus 4.5",
    releaseDate: "2025-11-24",
    creatorName: "Anthropic",
    ...over,
  };
}

// Minimal flight-escaped changelog HTML: two variants of one release plus an open line.
function changelogHtml(): string {
  const models = [
    {
      slug: "claude-opus-4-5-thinking",
      name: "Claude Opus 4.5 (Reasoning)",
      deprecated: true,
      isReasoning: true,
      effort: null,
      release: { slug: "claude-opus-4-5", name: "Claude Opus 4.5" },
      releaseDate: "2025-11-24",
      creator: { id: "aa", name: "Anthropic", logo: "/img/logos/anthropic_small.svg" },
    },
    {
      slug: "claude-opus-4-5",
      name: "Claude Opus 4.5 (Non-reasoning)",
      deprecated: true,
      isReasoning: false,
      effort: null,
      release: { slug: "claude-opus-4-5", name: "Claude Opus 4.5" },
      releaseDate: "2025-11-24",
      creator: { id: "aa", name: "Anthropic", logo: "/img/logos/anthropic_small.svg" },
    },
    {
      slug: "llama-3-3-70b",
      name: "Llama 3.3 70B",
      deprecated: false,
      isReasoning: false,
      effort: null,
      release: { slug: "llama-3-3", name: "Llama 3.3" },
      releaseDate: "2024-12-06",
      creator: { id: "mm", name: "Meta", logo: "/img/logos/meta_small.svg" },
    },
  ];
  const payload = JSON.stringify({ models }).replace(/"/g, '\\"');
  return `<html><body><script>self.__next_f.push([1,"${payload}"])</script></body></html>`;
}

describe("parseChangelogModels", () => {
  it("extracts the models array from flight-escaped HTML", () => {
    const models = parseChangelogModels(changelogHtml());
    expect(models).toHaveLength(3);
    expect(models[0]).toMatchObject({
      slug: "claude-opus-4-5-thinking",
      releaseSlug: "claude-opus-4-5",
      releaseName: "Claude Opus 4.5",
      releaseDate: "2025-11-24",
      creatorName: "Anthropic",
    });
  });

  it("returns [] when no models array is present", () => {
    expect(parseChangelogModels("<html><body>no data</body></html>")).toEqual([]);
  });
});

describe("matchesClosedRule", () => {
  it("fails closed for unknown creators", () => {
    expect(matchesClosedRule("Some New Lab", "some-model")).toBe(false);
  });

  it("lists all releases of exclusively proprietary vendors", () => {
    expect(matchesClosedRule("OpenAI", "gpt-5 GPT-5")).toBe(true);
    expect(matchesClosedRule("Anthropic", "claude-opus-4-5 Claude Opus 4.5")).toBe(true);
  });

  it("excludes open-weights lines of mixed vendors", () => {
    expect(matchesClosedRule("Google", "gemma-3 Gemma 3")).toBe(false);
    expect(matchesClosedRule("Google", "diffusiongemma-26b-a4b DiffusionGemma 26B")).toBe(false);
    expect(matchesClosedRule("Google", "gemini-2-5-pro Gemini 2.5 Pro")).toBe(true);
    expect(matchesClosedRule("Meta", "llama-3-3 Llama 3.3")).toBe(false);
    expect(matchesClosedRule("Meta", "muse-spark-1-3 Muse Spark 1.3")).toBe(true);
    expect(matchesClosedRule("Mistral", "mistral-large-3 Mistral Large 3")).toBe(true);
    expect(matchesClosedRule("Mistral", "mistral-small-3-1 Mistral Small 3.1")).toBe(false);
    expect(matchesClosedRule("Mistral", "devstral-medium Devstral Medium")).toBe(false);
    expect(matchesClosedRule("SpaceXAI", "grok-1 Grok-1")).toBe(false);
    expect(matchesClosedRule("SpaceXAI", "grok-4 Grok 4")).toBe(true);
  });
});

describe("toClosedReleases", () => {
  const weights = buildWeightsIndex([
    { slug: "indexed-open", id: "indexed-open", name: "Indexed Open", is_open_weights: true },
    { slug: "indexed-closed", id: "indexed-closed", name: "Indexed Closed", is_open_weights: false },
  ] as ArtificialAnalysisModel[]);

  it("prefers exact index weights over creator rules", () => {
    // OpenAI is rule-closed, but an exact open flag wins.
    expect(
      isClosedChangelogRelease(clModel({ slug: "indexed-open", releaseSlug: "indexed-open" }), weights),
    ).toBe(false);
    expect(
      isClosedChangelogRelease(clModel({ slug: "indexed-closed", releaseSlug: "indexed-closed" }), weights),
    ).toBe(true);
  });

  it("dedupes variants by release family, newest first", () => {
    const entries = toClosedReleases(
      [
        clModel(),
        clModel({ slug: "claude-opus-4-5", name: "Claude Opus 4.5 (Non-reasoning)" }),
        clModel({
          slug: "llama-3-3-70b",
          name: "Llama 3.3 70B",
          releaseSlug: "llama-3-3",
          releaseName: "Llama 3.3",
          releaseDate: "2024-12-06",
          creatorName: "Meta",
        }),
        clModel({
          slug: "mystery-1",
          name: "Mystery 1",
          releaseSlug: "mystery-1",
          releaseName: "Mystery 1",
          releaseDate: "2025-06-01",
          creatorName: "Some New Lab",
        }),
      ],
      new Map(),
    );
    // One row per release family; Llama (open line) and unknown vendors drop out.
    expect(entries.map((e) => e.id)).toEqual(["claude-opus-4-5"]);
    expect(entries[0]).toMatchObject({
      model: "Claude Opus 4.5",
      provider: "Anthropic",
      releaseDate: "2025-11-24",
      link: `${upstreamConfig.artificialAnalysis}/models/claude-opus-4-5`,
    });
  });
});
