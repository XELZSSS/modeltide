import { describe, expect, it, beforeEach } from "vitest";
import { resetModuleCachesForTests } from "@/server/infra/cache-service";
import {
  backfillFromMeta,
  buildWeightsRecord,
  compact,
  compactOmniscienceEnrich,
  mapEntry,
  mergeBySlug,
  parseChangelogModels,
  type ChangelogModel,
} from "@/server/parsers/aa";
import type { RawEntry } from "@/server/parsers/upstream";
import { buildAgentOverall, parseAgentBoards } from "@/server/parsers/agent-board";
import { isClosedChangelogRelease, toClosedReleases } from "@/server/parsers/closed-releases";
import { upstreamConfig } from "@/server/config";
import { SOURCE_LIMITS } from "@/shared/config";
import { normalizeModelKey } from "@/shared/utils";
import type { ArtificialAnalysisModel } from "@/shared/types";

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
    expect(compact(rawModel())).toMatchObject({
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
    expect(compact(rawModel()).omniscience_breakdown?.total).toEqual({
      accuracy: 88,
      attempt_rate: 70,
      hallucination_rate: 10,
      omniscience: 90,
    });
  });

  it.each([
    [85, 85],
    [0.5, 50],
  ])("normalizes sub-1 fractions to percents (analystAgent=%s)", (input, expected) => {
    expect(compact(rawModel({ analystAgent: input })).agentic_index).toBe(expected);
  });

  it("averages coding sub-scores only when at least one is present", () => {
    expect(compact(rawModel({ terminalbenchV21: null })).coding_index).toBe(60);
    const sparse = compact(rawModel({ terminalbenchV21: null, scicode: null }));
    expect(sparse.coding_index).toBeUndefined();
    expect("coding_index" in sparse).toBe(false);
  });

  it("omits absent optional fields (sparse payload contract)", () => {
    expect(Object.keys(compact(rawModel()).benchmarks!)).toContain("scicode");
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
    expect(
      mergeBySlug(
        [{ slug: "a", name: "A", omniscienceBreakdown: { accuracy: 1, attemptRate: 2 } }],
        [{ slug: "a", omniscienceBreakdown: { hallucinationRate: 3 } }],
      )[0]!.omniscienceBreakdown,
    ).toEqual({ accuracy: 1, attemptRate: 2, hallucinationRate: 3 });
  });

  it("drops catalog entries without slug or name", () => {
    expect(mergeBySlug([{ slug: "x" }, { name: "y" }])).toEqual([]);
  });

  it("does not let enrichment nulls clobber catalog values", () => {
    const [a] = mergeBySlug(
      [{ slug: "a", name: "A", intelligenceIndex: 1, omniscience: 80 }],
      [{ slug: "a", omniscience: null, medianOutputSpeed: null }],
    );
    expect(a!.intelligenceIndex).toBe(1);
    expect(a!.omniscience).toBe(80);
    expect("medianOutputSpeed" in a!).toBe(false);
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
    const filled = backfillFromMeta(models, {
      [normalizeModelKey("Model A")]: { agenticIndex: 55.4 },
      [normalizeModelKey("Model B")]: { agenticIndex: 99 },
      [normalizeModelKey("Unknown")]: { agenticIndex: 1 },
    });
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
    expect(backfillFromMeta(models, { [normalizeModelKey("Model A")]: { intelligenceIndex: 61.2 } })).toBe(1);
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

  it.each([[{ ...base, id: null }], [{ ...base, slug: null }], [{ ...base, elo: null }]])(
    "returns null when identity or elo is missing",
    (entry) => {
      expect(mapEntry(entry as RawEntry)).toBeNull();
    },
  );
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

  it("composites the overall board as the mean of the five signals", () => {
    const res = parseAgentBoards(FLIGHT_BODY);
    if (!res.ok) throw new Error(res.error);
    expect(res.data.map((r) => r.id)).toEqual(["contenders/c", "contenders/a", "contenders/b"]);
    expect(res.data.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(res.data[0]?.score).toBeCloseTo(0.2, 10);
    expect(res.data[1]?.score).toBeCloseTo(0.12, 10);
    expect(res.data[0]).toMatchObject({ ciLower: 0, ciUpper: 1 });
  });

  it("reports a failure when a signal board is missing (shape drift)", () => {
    expect(parseAgentBoards('41:{"signals":[]}').ok).toBe(false);
  });

  it("caps parsed boards at SOURCE_LIMITS.agentRankings entries", () => {
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

function changelogPayload(models: unknown[]): string {
  return JSON.stringify({ models });
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
    const models = parseChangelogModels(
      `<html><div data-payload='${changelogPayload([
        {
          slug: "gpt-5",
          name: "GPT-5",
          release: { slug: "gpt-5", name: "GPT-5" },
          releaseDate: "2026-01-15",
          creator: { id: "oa", name: "OpenAI" },
        },
      ])}'></div></html>`,
    );
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({ slug: "gpt-5", creatorName: "OpenAI" });
  });

  it("tolerates whitespace after the colon and common escapes", () => {
    const eAcute = String.fromCharCode(0xe9);
    const payload = changelogPayload([
      {
        slug: "m1",
        name: `M\nOne ${eAcute}`,
        release: { slug: "m1", name: "M One" },
        releaseDate: "2026-02-01",
        creator: { id: "x", name: "X" },
      },
    ])
      .replace(eAcute, "\\u00e9")
      .replace(/"models":/, '"models" :');
    const escaped = payload.replace(/"/g, '\\"');
    const models = parseChangelogModels(`<html><script>push([1,"${escaped}"])</script></html>`);
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({ slug: "m1", name: `M\nOne ${eAcute}` });
  });

  it("ignores non-array models values and still parses the real payload", () => {
    const html =
      `<script>track({"models":"decoy-string"})</script>` +
      `<script>track({"models":123})</script>` +
      `<div data-payload='${changelogPayload([
        {
          slug: "real",
          name: "Real",
          release: { slug: "real", name: "Real" },
          releaseDate: "2026-03-01",
          creator: { id: "r", name: "R" },
        },
      ])}'></div>`;
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

  it.each([
    ["indexed-open", false],
    ["indexed-closed", true],
  ])("respects exact index weights: %s -> closed=%s", (slug, expected) => {
    expect(isClosedChangelogRelease(clModel({ slug, releaseSlug: slug }), weights)).toBe(expected);
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
