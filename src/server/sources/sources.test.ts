import { describe, expect, it, vi, beforeEach } from "vitest";
import { resetModuleCachesForTests } from "@/server/infra/cache-service";
import { backfillFromMeta } from "@/server/parsers/aa-match-meta";
import { compact, compactOmniscienceEnrich } from "@/server/parsers/aa-catalog";
import { parseChangelogModels } from "@/server/parsers/aa-changelog";
import { buildWeightsRecord, mergeBySlug } from "@/server/parsers/aa-index";
import { getTextToImageLeaderboard } from "@/server/sources/aa/text-to-image";
import { mapEntry, type RawEntry } from "@/server/parsers/aa-text-to-image";
import { categoryFrom, creatorFromSlug, mapModels, titleFromSlug } from "@/server/parsers/or-rankings";
import { parseDirectoryRows } from "@/server/parsers/or-directory";
import { type ModelRow, type PricingEntry } from "@/server/parsers/or-types";
import { getModels, getModelById, fetchHFModelById } from "@/server/sources/huggingface";
import { UpstreamError } from "@/server/infra/errors";
import { CacheService } from "@/server/infra/cache-service";
import type { ProbeResult } from "@/server/infra/http-client";
import {
  HISTORY_BACKUP_KEY,
  HISTORY_KEY,
  SAMPLE_LOCK_KEY,
  ensureFreshSamples,
  latestSampleAt,
  readStore,
  recordStatusSamples,
} from "@/server/sources/status/store";
import { mergeSample, deriveEvents, uptimeRatio, avgLatency, type HistoryStore } from "@/server/sources/status/windows";
import { buildHistoryPayload } from "@/server/sources/status/payload";
import { getUptime } from "@/server/sources/status/uptime";
import { aggregateProbes, buildTargets, type ProbeTarget } from "@/server/sources/status/probe";
import { getStatusHistory } from "./status-history";
import { SOURCE_IDS, SOURCE_LIMITS } from "@/shared/config";
import { normalizeModelKey } from "@/shared/utils";
import { upstreamConfig } from "@/server/config";
import type { AppContext } from "@/server/context";
import type { ArtificialAnalysisModel, DayBucket, SourceStatus, UptimeSample } from "@/shared/types";
import { isClosedChangelogRelease, toClosedReleases } from "@/server/parsers/closed-releases";
import type { ChangelogModel } from "@/server/parsers/aa-changelog";

beforeEach(() => resetModuleCachesForTests());
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
    medianCanonicalAnswerOutputSpeed: 120,
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
      pricing: { input: 1.5, output: 6, cacheHit: 0.75 },
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
    expect(compact(rawModel({ terminalbenchV21: null, scicode: null })).coding_index).toBeUndefined();
    expect("coding_index" in compact(rawModel({ terminalbenchV21: null, scicode: null }))).toBe(false);
  });

  it("omits absent optional fields (sparse payload contract)", () => {
    const m = compact(rawModel());
    expect(Object.keys(m.benchmarks!)).toContain("scicode");
    expect(compact(rawModel({ gpqa: 85 })).benchmarks!.gpqa).toBe(85);
    expect(compact(rawModel({ gpqa: null })).benchmarks!.gpqa).toBeUndefined();
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

  it("ignores prototype keys from enrichment payloads", () => {
    const merged = mergeBySlug(
      [{ slug: "a", name: "A" }],
      [JSON.parse('{"slug":"a","__proto__":{"polluted":true},"constructor":"x","prototype":"y"}')],
    );
    expect(merged).toHaveLength(1);
    expect(Object.getPrototypeOf(merged[0]!)).toBe(Object.prototype);
    expect(Object.hasOwn(merged[0]!, "__proto__")).toBe(false);
  });
});

describe("buildWeightsRecord", () => {
  const wModel = (over: Record<string, unknown> = {}): ArtificialAnalysisModel =>
    ({ slug: "a", id: "a", name: "A", ...over }) as ArtificialAnalysisModel;

  it("indexes flags by slug and id, skipping flagless models", () => {
    expect(
      buildWeightsRecord([
        wModel({ slug: "open", id: "open", is_open_weights: true }),
        wModel({ slug: "closed", id: "ns/closed", is_open_weights: false }),
        wModel({ slug: "unknown" }),
      ]),
    ).toEqual({ open: true, closed: false, "ns/closed": false });
  });
});

describe("backfillFromMeta", () => {
  const aaModel = (over: Record<string, unknown> = {}): ArtificialAnalysisModel =>
    ({ slug: "a", name: "Model A", ...over }) as ArtificialAnalysisModel;

  it("fills only null values via loose key matching and reports the filled count", () => {
    const models = [
      aaModel({ agentic_index: null }),
      aaModel({ slug: "b", name: "Model B", agentic_index: 40 }),
      aaModel({ slug: "c", name: "Model C", agentic_index: null }),
    ];
    const meta = {
      [normalizeModelKey("Model A")]: { agenticIndex: 55.4 },
      [normalizeModelKey("Model B")]: { agenticIndex: 99 },
      [normalizeModelKey("Unknown")]: { agenticIndex: 1 },
    };
    const filled = backfillFromMeta(models, meta);
    expect(filled).toBe(1);
    expect(models[0]).toMatchObject({ agentic_index: 55.4 });
    expect(models[1]).toMatchObject({ agentic_index: 40 });
    expect(models[2]).toMatchObject({ agentic_index: null });
  });

  it("scales sub-1 fraction agentic values to the 0-100 scale", () => {
    const models = [aaModel({ agentic_index: null })];
    backfillFromMeta(models, { [normalizeModelKey("Model A")]: { agenticIndex: 0.5 } });
    expect(models[0]!.agentic_index).toBe(50);
  });

  it("backfills a missing intelligence index from the OpenRouter directory", () => {
    const models = [aaModel({ intelligence_index: null })];
    const filled = backfillFromMeta(models, { [normalizeModelKey("Model A")]: { intelligenceIndex: 61.2 } });
    expect(filled).toBe(1);
    expect(models[0]!.intelligence_index).toBe(61.2);
  });
});

describe("mapEntry (text-to-image)", () => {
  const base: RawEntry = {
    id: "9570e1d0-a390-48c1-a270-1317570fe3d5",
    slug: "gpt-image-2",
    name: "GPT Image 2 (high)",
    elo: 1178.11,
    lower95ci: 1168.11,
    upper95ci: 1188.11,
    creator: { name: "OpenAI" },
    price: 211,
  };

  it("maps direct elo, the CI pair and price", () => {
    expect(mapEntry(base)).toMatchObject({
      id: "9570e1d0-a390-48c1-a270-1317570fe3d5",
      slug: "gpt-image-2",
      name: "GPT Image 2 (high)",
      elo: 1178.11,
      eloLower: 1168.11,
      eloUpper: 1188.11,
      creatorName: "OpenAI",
      pricePer1kImages: 211,
    });
  });

  it("returns null when identity or elo is missing", () => {
    expect(mapEntry({ ...base, id: null })).toBeNull();
    expect(mapEntry({ ...base, slug: null })).toBeNull();
    expect(mapEntry({ ...base, elo: null })).toBeNull();
  });
});

describe("getTextToImageLeaderboard (no upstream rank)", () => {
  const T2I_FLIGHT_BODY = [
    '1:"$Sreact.fragment"',
    '20:{"props":{"textToImage":[{"id":"id-b","slug":"model-b","name":"Model B","url":"/image/model-families/b","elo":1100,"lower95ci":1090,"upper95ci":1110,"creator":{"name":"Org B"},"isDefault":true,"price":38.9},{"id":"id-a","slug":"model-a","name":"Model A","url":"/image/model-families/a","elo":1178.11,"lower95ci":1168.11,"upper95ci":1188.11,"creator":{"name":"Org A"},"isDefault":true,"price":211}]}}',
  ].join("\n");

  it("derives ranks from elo order instead of yielding 0 models", async () => {
    const ctx = {
      cache: new CacheService(undefined, "v-t2i-current-schema"),
      http: { text: async () => T2I_FLIGHT_BODY },
      kv: undefined,
      log: () => {},
    } as unknown as AppContext;
    const payload = await getTextToImageLeaderboard(ctx);
    expect(payload.models).toHaveLength(2);
    expect(payload.models[0]).toMatchObject({
      slug: "model-a",
      rank: 1,
      elo: 1178.11,
      eloLower: 1168.11,
      eloUpper: 1188.11,
    });
    expect(payload.models[1]).toMatchObject({ slug: "model-b", rank: 2, elo: 1100 });
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
    total_native_tokens_cached: 0,
    count: 2,
    total_tool_calls: 0,
    change: 1,
    ...over,
  };
}

const pricing = new Map<string, PricingEntry>([
  ["openai/gpt-5", { input: 1, output: 2, cacheHit: 0.5, cacheWrite: 1.5 }],
]);

describe("creatorFromSlug / titleFromSlug / categoryFrom", () => {
  it("maps known creators and title-cases unknown orgs", () => {
    expect(creatorFromSlug("openai/gpt-5")).toBe("OpenAI");
    expect(creatorFromSlug("meta-llama/llama-4")).toBe("Meta");
    expect(creatorFromSlug("some-org/model_x")).toBe("Some Org");
  });

  it("does not resolve prototype-chain org names as creators", () => {
    expect(creatorFromSlug("constructor/x")).toBe("Constructor");
  });

  it("derives a display title from the permaslug", () => {
    expect(titleFromSlug("openai/gpt-5")).toBe("GPT 5");
    expect(titleFromSlug("solo-model")).toBe("Solo Model");
    expect(titleFromSlug("openai/gpt-4o")).toBe("GPT 4o");
    expect(titleFromSlug("meta-llama/llama-3-405b")).toBe("Llama 3 405b");
  });

  it("classifies category from slug and name", () => {
    expect(categoryFrom("deepseek/deepseek-coder-v2", "DeepSeek Coder V2")).toBe("coding");
    expect(categoryFrom("deepseek/deepseek-r1", "DeepSeek R1")).toBe("reasoning");
    expect(categoryFrom("qwen/qwen3-max", "Qwen3 Max")).toBe("general");
  });
});

describe("parseDirectoryRows", () => {
  it("drops -1 sentinel cache legs but keeps valid pricing legs", () => {
    const entry = parseDirectoryRows([
      {
        id: "acme/dynamic-model",
        pricing: {
          prompt: "0.000001",
          completion: "0.000002",
          input_cache_read: "-1",
          input_cache_write: "-1",
        },
      },
    ]);
    expect(entry.pricing["acme/dynamic-model"]).toEqual({
      input: 1,
      output: 2,
      cacheHit: null,
      cacheWrite: null,
    });
  });

  it("keeps non-negative cache legs scaled to per-million", () => {
    const entry = parseDirectoryRows([
      {
        id: "acme/cached-model",
        pricing: {
          prompt: "0.000003",
          completion: "0.000015",
          input_cache_read: "0.0000003",
          input_cache_write: "0.00000375",
        },
      },
    ]);
    expect(entry.pricing["acme/cached-model"]).toEqual({
      input: 3,
      output: 15,
      cacheHit: 0.3,
      cacheWrite: 3.75,
    });
  });

  it("rejects rows whose prompt/completion sentinel is negative", () => {
    const entry = parseDirectoryRows([
      {
        id: "acme/valid-model",
        pricing: { prompt: "0.000001", completion: "0.000002" },
      },
      {
        id: "acme/dynamic-model",
        pricing: { prompt: "-1", completion: "0.000002" },
      },
    ]);
    expect(entry.pricing["acme/dynamic-model"]).toBeUndefined();
    expect(entry.pricing["acme/valid-model"]).toEqual({ input: 1, output: 2, cacheHit: null, cacheWrite: null });
  });
});

describe("mapModels", () => {
  it("aggregates rows by permaslug, keeping the latest change, and attaches pricing", () => {
    const models = mapModels(
      [
        row(),
        row({
          date: "2026-08-02",
          total_prompt_tokens: 10,
          change: null,
          total_native_tokens_cached: 7,
          total_tool_calls: 3,
        }),
      ],
      pricing,
    );
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
      cachedTokens: 7,
      toolCalls: 3,
      change: 100,
      pricing: pricing.get("openai/gpt-5"),
    });
    expect(m.isFree).toBe(false);
  });

  it("marks free models and leaves pricing undefined when absent", () => {
    const free = new Map([["a/b", { input: 0, output: 0, cacheHit: 0, cacheWrite: 0 }]]);
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

  it("keeps multi-variant rows without token data below genuine zero usage", () => {
    const missing = {
      total_prompt_tokens: undefined,
      total_completion_tokens: undefined,
    } as unknown as Partial<ModelRow>;
    const models = mapModels(
      [
        row({ model_permaslug: "u/unknown", variant_permaslug: "u/unknown:a", ...missing }),
        row({ model_permaslug: "u/unknown", variant_permaslug: "u/unknown:b", ...missing }),
        row({
          model_permaslug: "z/zero",
          variant_permaslug: "z/zero",
          total_prompt_tokens: 0,
          total_completion_tokens: 0,
        }),
      ],
      new Map(),
    );
    expect(models.map((m) => m.id)).toEqual(["z/zero", "u/unknown"]);
  });

  it("merges variant rows of one model into a single entry with dominant-variant pricing", () => {
    const variantPricing = new Map<string, PricingEntry>([
      ["a/b:standard", { input: 2, output: 3, cacheHit: 1, cacheWrite: 2 }],
      ["a/b:free", { input: 0, output: 0, cacheHit: 0, cacheWrite: 0 }],
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
const NOW = Date.UTC(2026, 7, 30, 12, 0, 0);
const historyId: SourceStatus["id"] = "openrouter";

const sample = (minAgo: number, ok: boolean, latencyMs: number | null = ok ? 900 : null): UptimeSample => ({
  t: NOW - minAgo * MIN,
  ok,
  latencyMs,
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
    const bucket = entry.daily.find((b) => b.day === "2026-08-30");
    expect(bucket).toMatchObject({ total: 1, ok: 1 });
  });

  it("rolls daily buckets and counts ok→fail transitions as incidents", () => {
    let entry = mergeSample(undefined, sample(30, true), NOW);
    entry = mergeSample(entry, sample(20, false), NOW);
    entry = mergeSample(entry, sample(10, false), NOW);
    entry = mergeSample(entry, sample(0, true), NOW);

    expect(entry.daily).toHaveLength(1);
    const bucket = entry.daily[0]!;
    expect(bucket).toMatchObject({ day: "2026-08-30", total: 4, ok: 2 });
  });

  it("counts a failing first sample", () => {
    const entry = mergeSample(undefined, sample(5, false), NOW);
    expect(entry.daily[0]!.total).toBe(1);
  });

  it("keeps one incident when the outage recovers after the flipped re-run", () => {
    let entry = mergeSample(undefined, sample(10, true), NOW);
    entry = mergeSample(entry, sample(9, false), NOW);
    entry = mergeSample(entry, sample(7, true, 400), NOW);
    const bucket = entry.daily.find((b) => b.day === "2026-08-30");
    expect(bucket).toMatchObject({ total: 2, ok: 1 });
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
 * Vitest 4 mock: route probe results per URL (no vi.when / .calledWith chains).
 * URLs listed in `downFor` fail; every other call resolves with `okProbe()`.
 */
function mockProbe(downFor: string[] = []) {
  const up = okProbe();
  const down: ProbeResult = { ok: false, status: 503, latencyMs: null, error: "HTTP 503" };
  return vi.fn<(url: string) => Promise<ProbeResult>>((url: string) =>
    Promise.resolve(downFor.includes(url) ? down : up),
  );
}

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
    const http503 = { ok: false, status: 503, latencyMs: null, error: "HTTP 503" } as const;
    const agg = aggregateProbes([
      { target: target("news"), probe: { ...http503 } },
      { target: target("news"), probe: { ...http503 } },
    ]);
    expect(agg.get("news")).toEqual({ ok: false, status: null, latencyMs: null, error: "2/2 feeds failed" });
  });

  it("keeps the single-feed error message when only one target exists", () => {
    const agg = aggregateProbes([
      { target: target("openrouter"), probe: { ok: false, status: 500, latencyMs: null, error: "HTTP 500" } },
    ]);
    expect(agg.get("openrouter")!.error).toBe("HTTP 500");
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
    const agg = aggregateProbes([
      { target: target("news"), probe: { ok: false, status: 503, latencyMs: null, error: "HTTP 503" } },
      { target: target("news"), probe: failProbe("timeout") },
    ]);
    expect(agg.get("news")).toEqual({ ok: false, status: null, latencyMs: null, error: "HTTP 503" });
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
    expect(or).toMatchObject({ uptime24h: null, uptime7d: null, uptime30d: null, avgLatency24h: null, ok: false });
    expect(payload.events).toHaveLength(0);
    expect(payload.uptimeMs).toBe(0);
    expect(payload.generatedAt).toBe(new Date(NOW).toISOString());
  });

  it("emits a card for every provider status source (regression: SOURCE_IDS drift)", () => {
    const store: HistoryStore = { sources: {} };
    const payload = buildHistoryPayload(store, { firstLaunchAt: new Date(NOW).toISOString(), uptimeMs: 0 }, NOW);
    const ids = payload.sources.map((s) => s.id);
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
      expect(ids).toContain(provider);
    }
    expect(ids).toHaveLength(new Set(ids).size);
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
    const daily: DayBucket[] = [...stale, ...fresh];
    const payload = buildHistoryPayload(
      { sources: { [historyId]: { recent, daily } } },
      { firstLaunchAt: new Date(NOW).toISOString(), uptimeMs: 5 * MIN },
      NOW,
    );
    const or = payload.sources.find((s) => s.id === historyId)!;
    expect(or.uptime24h).toBeCloseTo(2 / 3);
    expect(or.uptime7d).toBeCloseTo(0.99);
    expect(or.uptime30d).toBeCloseTo(0.99);
    expect(or.ok).toBe(false);
    expect(or.checkedAt).toBe(new Date(NOW - MIN).toISOString());
    expect(payload.uptimeMs).toBe(5 * MIN);
  });

  it("reports uptime30d as null (not 0%) when daily buckets carry no samples", () => {
    const emptyBucket: DayBucket = { day: "2026-08-30", total: 0, ok: 0 };
    const payload = buildHistoryPayload(
      { sources: { [historyId]: { recent: [], daily: [emptyBucket] } } },
      { firstLaunchAt: new Date(NOW).toISOString(), uptimeMs: 0 },
      NOW,
    );
    expect(payload.sources.find((s) => s.id === historyId)!.uptime30d).toBeNull();
  });
});

describe("getStatusHistory read-only", () => {
  function buildHistoryCtx(kvStore: Map<string, string>, probeOk = true): AppContext {
    const kv = {
      get: async (key: string) => kvStore.get(key) ?? null,
      put: async (key: string, value: string) => {
        kvStore.set(key, value);
      },
      delete: async (key: string) => {
        kvStore.delete(key);
      },
    } as unknown as AppContext["kv"];
    return {
      cache: new CacheService(kv, "v-test"),
      http: {
        probe: async () => ({ ok: probeOk, status: probeOk ? 200 : 503, latencyMs: probeOk ? 500 : null, error: null }),
        json: async (url: string) => {
          if (url.includes("status.cloud.google.com")) return [];
          return { components: [{ name: "API", status: "operational" }] };
        },
      } as unknown as AppContext["http"],
      kv,
      log: () => {},
    };
  }

  /** buildHistoryCtx clone whose http.probe is a spyable mock. */
  function withProbe(kvStore: Map<string, string>, probe: AppContext["http"]["probe"]): AppContext {
    const base = buildHistoryCtx(kvStore);
    return { ...base, http: { ...base.http, probe } as unknown as AppContext["http"] };
  }

  it("serves an empty store without sampling, so reads never touch upstreams", async () => {
    const kvStore = new Map<string, string>();
    const probe = mockProbe();
    const ctx = withProbe(kvStore, probe);
    const payload = await getStatusHistory(ctx);
    expect(kvStore.has(HISTORY_KEY)).toBe(false);
    expect(probe).not.toHaveBeenCalled();
    expect(payload.sources.every((s) => s.ok === false)).toBe(true);
  });

  it("serves persisted samples without re-probing", async () => {
    const kvStore = new Map<string, string>();
    await recordStatusSamples(buildHistoryCtx(kvStore));
    expect(kvStore.has(HISTORY_KEY)).toBe(true);
    const probe = mockProbe();
    const ctx = withProbe(kvStore, probe);
    const payload = await getStatusHistory(ctx);
    const or = payload.sources.find((s) => s.id === "openrouter")!;
    expect(or.ok).toBe(true);
    expect(or.checkedAt).not.toBeNull();
    expect(or.uptime24h).toBe(1);
    expect(probe).not.toHaveBeenCalled();
  });

  it("skips the write while the lock is held instead of racing the writer", async () => {
    const lockValue = `owner-${Date.now()}:${Date.now() + 120_000}`;
    const kvStore = new Map<string, string>([[SAMPLE_LOCK_KEY, lockValue]]);
    await recordStatusSamples(buildHistoryCtx(kvStore));
    expect(kvStore.has(HISTORY_KEY)).toBe(false);
  });

  it("records a failed probe as a down sample when probes fail", async () => {
    const kvStore = new Map<string, string>();
    await recordStatusSamples(buildHistoryCtx(kvStore, false));
    const payload = await getStatusHistory(buildHistoryCtx(kvStore));
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
    const ctx = withProbe(kvStore, probe);
    await recordStatusSamples(ctx);
    const payload = await getStatusHistory(ctx);
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
    const ctx = withProbe(kvStore, mockProbe([openrouterUrl]));
    await recordStatusSamples(ctx);
    const payload = await getStatusHistory(ctx);
    const or = payload.sources.find((s) => s.id === historyId)!;
    expect(or.ok).toBe(true);
  });

  it("writes nothing when the whole round is unknown (all probes time out, all status pages fail)", async () => {
    const kvStore = new Map<string, string>();
    const base = buildHistoryCtx(kvStore);
    const ctx = {
      ...base,
      http: {
        ...base.http,
        probe: async () => ({ ok: false, status: null, latencyMs: null, error: "timeout" }),
        json: async () => {
          throw new Error("timeout");
        },
      },
    } as unknown as AppContext;
    await recordStatusSamples(ctx);
    expect(kvStore.has(HISTORY_KEY)).toBe(false);
  });

  it("keeps the previous state when a later round is unknown", async () => {
    const kvStore = new Map<string, string>();
    await recordStatusSamples(buildHistoryCtx(kvStore));
    const before = await getStatusHistory(buildHistoryCtx(kvStore));
    expect(before.sources.find((s) => s.id === historyId)!.ok).toBe(true);
    const base = buildHistoryCtx(kvStore);
    const unknownCtx = {
      ...base,
      http: {
        ...base.http,
        probe: async () => ({ ok: false, status: null, latencyMs: null, error: "timeout" }),
        json: async () => {
          throw new Error("timeout");
        },
      },
    } as unknown as AppContext;
    await recordStatusSamples(unknownCtx);
    const after = await getStatusHistory(buildHistoryCtx(kvStore));
    expect(after.sources.find((s) => s.id === historyId)!.ok).toBe(true);
    expect(after.events).toHaveLength(0);
  });
});

describe("buildTargets", () => {
  it("samples one feed per news category instead of every feed", async () => {
    const { NEWS_CATEGORIES } = await import("@/shared/config");
    const targets = buildTargets();
    const news = targets.filter((t) => t.id === "news");
    expect(news).toHaveLength(NEWS_CATEGORIES.length);
    expect(targets).toHaveLength(6 + NEWS_CATEGORIES.length);
    expect(targets.filter((t) => t.id === "openrouter")).toHaveLength(2);
    expect(targets.filter((t) => t.id === "artificialAnalysis")).toHaveLength(2);
    expect(targets.some((t) => t.id === "arena")).toBe(true);
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
    expect(deleted).toContain(HISTORY_KEY);
  });

  it("backs up the raw payload before clearing an unsalvageable store", async () => {
    const raw = "truncated-json{{{";
    const kvStore = new Map<string, string>([[HISTORY_KEY, raw]]);
    const putOptions: unknown[] = [];
    const ctx = {
      kv: {
        get: async (key: string) => kvStore.get(key) ?? null,
        put: async (key: string, value: string, opts?: unknown) => {
          kvStore.set(key, value);
          putOptions.push(opts);
        },
        delete: async (key: string) => {
          kvStore.delete(key);
        },
      },
    } as unknown as AppContext;
    await expect(readStore(ctx)).resolves.toEqual({ sources: {} });
    expect(kvStore.get(HISTORY_BACKUP_KEY)).toBe(JSON.stringify([raw]));
    expect(kvStore.has(HISTORY_KEY)).toBe(false);
    expect(putOptions[0]).toMatchObject({ expirationTtl: 90 * 24 * 60 * 60 });
  });

  it("salvages the readable per-source entries of a partially corrupt store", async () => {
    const good = {
      recent: [{ t: Date.now() - 60_000, ok: true, latencyMs: 10, status: 200, error: null }],
      daily: [{ day: "2026-01-01", total: 3, ok: 2 }],
    };
    const raw = JSON.stringify({ sources: { openrouter: good, news: "garbage-not-an-entry" } });
    const kvStore = new Map<string, string>([[HISTORY_KEY, raw]]);
    const ctx = {
      kv: {
        get: async (key: string) => kvStore.get(key) ?? null,
        put: async () => {},
        delete: async () => {},
      },
    } as unknown as AppContext;
    await expect(readStore(ctx)).resolves.toEqual({ sources: { openrouter: good } });
    expect(kvStore.has(HISTORY_BACKUP_KEY)).toBe(false);
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
    const ctx = {
      kv: {
        get: async (key: string) => kvStore.get(key) ?? null,
        put: async () => {},
        delete: async () => {},
      },
      log,
    } as unknown as AppContext;
    await ensureFreshSamples(ctx);
    await ensureFreshSamples(ctx);
    const staleWarns = log.mock.calls.filter((c) => String(c[1] ?? c[0]).includes("stale"));
    expect(staleWarns).toHaveLength(1);
    expect(staleWarns[0]![0]).toBe("warn");
  });

  // "v1:status-history" is the one-time pre-v3 bridge (see store.ts).
  it("adopts the previous-generation key instead of losing history on version bumps", async () => {
    const legacyKey = "v1:status-history";
    const store = { sources: { openrouter: { recent: [], daily: [] } } };
    const kvStore = new Map<string, string>([[legacyKey, JSON.stringify(store)]]);
    const ctx = {
      kv: {
        get: async (key: string) => kvStore.get(key) ?? null,
        put: async (key: string, value: string) => {
          kvStore.set(key, value);
        },
        delete: async (key: string) => {
          kvStore.delete(key);
        },
      },
    } as unknown as AppContext;
    await expect(readStore(ctx)).resolves.toEqual(store);
    expect(kvStore.get(HISTORY_KEY)).toBe(JSON.stringify(store));
    expect(kvStore.has(legacyKey)).toBe(false);
  });

  it("prefers the stable key and leaves legacy data alone", async () => {
    const fresh = { sources: { news: { recent: [], daily: [] } } };
    const legacy = {
      sources: {
        news: {
          recent: [],
          daily: [{ day: "2026-01-01", total: 1, ok: 1 }],
        },
      },
    };
    const legacyKey = "v1:status-history";
    const kvStore = new Map<string, string>([
      [HISTORY_KEY, JSON.stringify(fresh)],
      [legacyKey, JSON.stringify(legacy)],
    ]);
    const ctx = {
      kv: {
        get: async (key: string) => kvStore.get(key) ?? null,
        put: async (key: string, value: string) => {
          kvStore.set(key, value);
        },
        delete: async (key: string) => {
          kvStore.delete(key);
        },
      },
    } as unknown as AppContext;
    await expect(readStore(ctx)).resolves.toEqual(fresh);
    expect(kvStore.get(legacyKey)).toBe(JSON.stringify(legacy));
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

  it("throws on empty results so stale cache is served instead of poisoning the key", async () => {
    const { ctx } = hfCtx([]);
    await expect(getModels(ctx, { sort: "trendingScore", direction: "-1", limit: 500 })).rejects.toThrow(
      "0 usable models",
    );
  });

  it("excludes rows without an open license, like releases do", async () => {
    const { ctx } = hfCtx([
      { id: "org/open", downloads: 10, likes: 1, tags: ["license:mit"] },
      { id: "org/closed", downloads: 99, likes: 9, tags: ["license:proprietary"] },
      { id: "org/unknown", downloads: 50, likes: 5, tags: [] },
    ]);
    const { data: models } = await getModels(ctx, { sort: "trendingScore", direction: "-1", limit: 500 });
    expect(models.map((m) => m.id)).toEqual(["org/open"]);
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
          return [{ id: "org/model", downloads: 10, likes: 1, tags: ["license:mit"] }];
        },
      } as unknown as AppContext["http"],
      kv,
      log: () => {},
    };
    await getModels(ctx, { sort: "trendingScore", direction: "-1", limit: 7 });
    expect(new URL(fetchedUrl).searchParams.get("limit")).toBe("50");
  });

  it("caches the full bucket payload so sibling limits never poison each other", async () => {
    const items = Array.from({ length: 600 }, (_, i) => ({
      id: `org/model-${i}`,
      downloads: 600 - i,
      likes: 1,
      tags: ["license:mit"],
    }));
    const kvStore = new Map<string, string>();
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
    } as unknown as AppContext;

    const first = await getModels(ctx, { sort: "trendingScore", direction: "-1", limit: 101 });
    expect(first.data).toHaveLength(101);
    expect(first.fetchedAt).toBeDefined();

    const cachedRaw = JSON.parse(kvStore.get("v1:open-source-models:trendingScore:-1:200")!) as {
      d: { id: string }[] | { data: { id: string }[]; fetchedAt: string };
    };
    const cachedData = Array.isArray(cachedRaw.d) ? cachedRaw.d : (cachedRaw.d as { data: { id: string }[] }).data;
    expect(cachedData).toHaveLength(600);

    const sibling = await getModels(ctx, { sort: "trendingScore", direction: "-1", limit: 150 });
    expect(sibling.data).toHaveLength(150);
    const full = await getModels(ctx, { sort: "trendingScore", direction: "-1", limit: 500 });
    expect(full.data).toHaveLength(500);
  });
});

describe("fetchHFModelById / getModelById (window-free detail lookup)", () => {
  const row = {
    id: "org/niche-model",
    author: "org",
    downloads: 3,
    likes: 0,
    pipeline_tag: "text-generation",
    createdAt: "2026-01-01T00:00:00Z",
    lastModified: "2026-02-01T00:00:00Z",
    tags: ["license:mit"],
  };
  const byIdCtx = (json: (url: string) => Promise<unknown>): AppContext =>
    ({
      cache: new CacheService(undefined, "v-hf-by-id"),
      http: { json },
      kv: undefined,
      log: () => {},
    }) as unknown as AppContext;

  it("maps a single upstream row without any list window", async () => {
    const ctx = byIdCtx(async (url: string) => {
      expect(url).toContain("/org/niche-model");
      return row;
    });
    const model = await fetchHFModelById(ctx, "org/niche-model");
    expect(model).toMatchObject({ id: "org/niche-model", license: "mit" });
    const payload = await getModelById(ctx, "org/niche-model");
    expect(payload.data).toMatchObject({ id: "org/niche-model" });
  });

  it("resolves upstream 404 to null instead of a 502", async () => {
    const ctx = byIdCtx(async () => {
      throw new UpstreamError("HTTP 404 for https://huggingface.co/api/models/org/gone", { status: 404 });
    });
    await expect(fetchHFModelById(ctx, "org/gone")).resolves.toBeNull();
  });

  it("rejects malformed ids without touching the network", async () => {
    const ctx = byIdCtx(async () => {
      throw new Error("must not fetch");
    });
    await expect(fetchHFModelById(ctx, "   ")).rejects.toThrow(/Invalid Hugging Face model id/);
  });
});

describe("parseAgentBoards (agent overall composite)", () => {
  const SIGNALS = [
    "task_outcome_explicit",
    "praise_complaint",
    "steerability",
    "bash_recovery_steps",
    "tool_hallucination",
  ];
  const entry = (id: string, name: string, score: number | null) => ({
    contenderName: id,
    model: name,
    modelOrganization: "Org",
    license: "Proprietary",
    isPublic: true,
    score,
    ciLower: 0,
    ciUpper: 1,
    rank: 1,
  });
  // C wins on consistency (0.20 avg) although A tops two signals.
  const scores: Record<string, number[]> = {
    "contenders/a": [0.3, 0.3, 0.0, 0.0, 0.0],
    "contenders/b": [0.1, 0.1, 0.1, 0.1, 0.1],
    "contenders/c": [0.2, 0.2, 0.2, 0.2, 0.2],
  };
  const FLIGHT_BODY = [
    "41:" +
      JSON.stringify({
        signals: SIGNALS.map((signal, si) => ({
          name: signal,
          entries: [
            entry("contenders/a", "A", scores["contenders/a"]![si]!),
            entry("contenders/b", "B", scores["contenders/b"]![si]!),
            entry("contenders/c", "C", scores["contenders/c"]![si]!),
            { contenderName: "broken", model: "", score: null },
          ],
        })),
      }),
  ].join("\n");

  it("composites the overall board as the mean of the five signals", async () => {
    const { parseAgentBoards } = await import("@/server/parsers/agent-board");
    const rows = parseAgentBoards(FLIGHT_BODY);
    expect(rows.map((r) => r.id)).toEqual(["contenders/c", "contenders/a", "contenders/b"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(rows[0]?.score).toBeCloseTo(0.2, 10);
    expect(rows[1]?.score).toBeCloseTo(0.12, 10);
    expect(rows[0]).toMatchObject({ ciLower: 0, ciUpper: 1 });
  });

  it("throws when a signal board is missing (shape drift)", async () => {
    const { parseAgentBoards } = await import("@/server/parsers/agent-board");
    expect(() => parseAgentBoards('41:{"signals":[]}')).toThrow();
  });

  it("feeds getAgentRankings through the RSC flight path", async () => {
    const { getAgentRankings } = await import("@/server/sources/agent-arena");
    const requested: { url: string; rsc: boolean }[] = [];
    const ctx = {
      cache: new CacheService(undefined, "v-agent-rsc"),
      http: {
        text: async (url: string, init: { headers?: Record<string, string> }) => {
          requested.push({ url, rsc: init.headers?.RSC === "1" });
          return FLIGHT_BODY;
        },
      },
      kv: undefined,
      log: () => {},
    } as unknown as AppContext;
    const payload = await getAgentRankings(ctx);
    expect(requested).toHaveLength(1);
    expect(requested[0]).toMatchObject({ url: expect.stringContaining("/leaderboard/agent"), rsc: true });
    expect(payload.entries).toHaveLength(3);
  });

  it("caps parsed boards at SOURCE_LIMITS.agentRankings entries", async () => {
    const { buildAgentOverall } = await import("@/server/parsers/agent-board");
    const boards = SIGNALS.map((signal) => ({
      signal,
      rows: Array.from({ length: 150 }, (_, i) => ({
        id: `model-${i}`,
        name: `Model ${i}`,
        creator: "Org",
        score: 1 - i / 1000,
        ciLower: null,
        ciUpper: null,
        license: null,
      })),
    }));
    expect(buildAgentOverall(boards)).toHaveLength(SOURCE_LIMITS.agentRankings);
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

  it("extracts plain (non-escaped) models arrays too", () => {
    const payload = JSON.stringify({
      models: [
        {
          slug: "gpt-5",
          name: "GPT-5",
          release: { slug: "gpt-5", name: "GPT-5" },
          releaseDate: "2026-01-15",
          creator: { id: "oa", name: "OpenAI" },
        },
      ],
    });
    const models = parseChangelogModels(`<html><div data-payload='${payload}'></div></html>`);
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({ slug: "gpt-5", creatorName: "OpenAI" });
  });

  it("tolerates whitespace after the colon and common escapes", () => {
    const payload = JSON.stringify({
      models: [
        {
          slug: "m1",
          name: "M\nOne é",
          release: { slug: "m1", name: "M One" },
          releaseDate: "2026-02-01",
          creator: { id: "x", name: "X" },
        },
      ],
    })
      .replace("é", "\\u00e9")
      .replace(/"models":/, '"models" :');
    const escaped = payload.replace(/"/g, '\\"');
    const models = parseChangelogModels(`<html><script>push([1,"${escaped}"])</script></html>`);
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({ slug: "m1", name: "M\nOne é" });
  });

  it("ignores non-array models values and still parses the real payload", () => {
    const good = JSON.stringify({
      models: [
        {
          slug: "real",
          name: "Real",
          release: { slug: "real", name: "Real" },
          releaseDate: "2026-03-01",
          creator: { id: "r", name: "R" },
        },
      ],
    });
    const html =
      `<script>track({"models":"decoy-string"})</script>` +
      `<script>track({"models":123})</script>` +
      `<div data-payload='${good}'></div>`;
    const models = parseChangelogModels(html);
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({ slug: "real", creatorName: "R" });
  });
});

describe("isClosedChangelogRelease (weights-only)", () => {
  const weights = new Map<string, boolean>(
    Object.entries(
      buildWeightsRecord([
        { slug: "indexed-open", id: "indexed-open", name: "Indexed Open", is_open_weights: true },
        { slug: "indexed-closed", id: "indexed-closed", name: "Indexed Closed", is_open_weights: false },
      ] as ArtificialAnalysisModel[]),
    ),
  );

  it("excludes explicitly open weights and keeps flagged-closed ones", () => {
    expect(isClosedChangelogRelease(clModel({ slug: "indexed-open", releaseSlug: "indexed-open" }), weights)).toBe(
      false,
    );
    expect(isClosedChangelogRelease(clModel({ slug: "indexed-closed", releaseSlug: "indexed-closed" }), weights)).toBe(
      true,
    );
  });

  it("treats unknown weights as closed: unverified weights are not open weights", () => {
    expect(isClosedChangelogRelease(clModel({ slug: "some-new-lab-model" }), new Map())).toBe(true);
  });
});

describe("toClosedReleases", () => {
  const weights = new Map<string, boolean>(
    Object.entries(
      buildWeightsRecord([
        { slug: "indexed-open", id: "indexed-open", name: "Indexed Open", is_open_weights: true },
        { slug: "indexed-closed", id: "indexed-closed", name: "Indexed Closed", is_open_weights: false },
        { slug: "llama-3-3", id: "llama-3-3", name: "Llama 3.3", is_open_weights: true },
        { slug: "mystery-1", id: "mystery-1", name: "Mystery 1", is_open_weights: true },
      ] as ArtificialAnalysisModel[]),
    ),
  );

  it("respects exact index weights", () => {
    expect(isClosedChangelogRelease(clModel({ slug: "indexed-open", releaseSlug: "indexed-open" }), weights)).toBe(
      false,
    );
    expect(isClosedChangelogRelease(clModel({ slug: "indexed-closed", releaseSlug: "indexed-closed" }), weights)).toBe(
      true,
    );
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
      weights,
    );
    expect(entries.map((e) => e.id)).toEqual(["claude-opus-4-5"]);
    expect(entries[0]).toMatchObject({
      model: "Claude Opus 4.5",
      provider: "Anthropic",
      releaseDate: "2025-11-24",
      link: `${upstreamConfig.artificialAnalysis}/models/claude-opus-4-5`,
    });
  });

  it("caps the released list at SOURCE_LIMITS.closedReleases, newest first", () => {
    const changelog = Array.from({ length: 250 }, (_, i) =>
      clModel({
        slug: `model-${i}`,
        name: `Model ${i}`,
        releaseSlug: `model-${i}`,
        releaseName: `Model ${i}`,
        releaseDate: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
        creatorName: "Anthropic",
      }),
    );
    const entries = toClosedReleases(changelog, new Map());
    expect(entries).toHaveLength(SOURCE_LIMITS.closedReleases);
    expect(entries[0]?.releaseDate).toBe("2026-01-28");
  });
});
