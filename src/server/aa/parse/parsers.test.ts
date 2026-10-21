import { describe, expect, it, beforeEach } from "vitest";
import { resetModuleCachesForTests } from "@/server/cache/service";
import { backfillFromMeta, mergeBySlug } from "./model-enrich";
import { compact } from "./model-compact";
import { parseLeaderboardModels } from "./leaderboard";
import { parseChangelogModels, type ChangelogModel } from "./changelog";
import { mapEntry } from "./text-to-image";
import type { RawEntry } from "@/server/formats/wire-types";

import { toClosedReleases } from "@/server/releases/parse";
import { normalizeModelKey } from "@/shared/utils";
import type { ArtificialAnalysisModel } from "@/shared/types";

beforeEach(() => resetModuleCachesForTests());

function unwrap<T>(res: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

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
    terminalBench21: 0.8,
    terminalbenchHard: 0.7,
    terminalBench40: 0.9,
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
      pricing: { input: 1.5, output: 6, cacheHit: 0.75, cacheWrite: null },
      speed: { median_output_speed: 120 },
    });
    expect(compact(rawModel()).omniscience_breakdown?.total).toEqual({
      accuracy: 88,
      attempt_rate: 70,
      hallucination_rate: 10,
      omniscience: 90,
    });
    expect(compact(rawModel()).benchmarks).toMatchObject({
      terminalbench_v2_1: 80,
      terminalbench_hard: 70,
      terminalbench_v4_0: 90,
      omniscience: 90,
    });
    expect(compact(rawModel({ omniscience: -5.3 })).benchmarks?.omniscience).toBe(-5.3);
    expect(compact(rawModel({ omniscience: -5.3 })).omniscience_breakdown?.total?.omniscience).toBe(-5.3);
  });

  it("averages coding sub-scores only when at least one is present", () => {
    expect(compact(rawModel({ terminalBench21: null })).coding_index).toBe(60);
    expect(compact(rawModel({ terminalBench21: null, scicode: null })).coding_index).toBeNull();
  });

  it("drops invalid release dates", () => {
    expect(compact(rawModel({ releaseDate: "not-a-date" })).release_date).toBeNull();
  });

  it("accepts either upstream spelling of the itbench_sre benchmark", () => {
    // /models spells it `itBenchSre`; /leaderboards and /omniscience spell it `itbenchSre`.
    expect(compact(rawModel({ itBenchSre: 0.44 })).benchmarks?.itbench_sre).toBe(44);
    expect(compact(rawModel({ itbenchSre: 0.44 })).benchmarks?.itbench_sre).toBe(44);
  });

  it("reads gdpval from the normalized ratio, never the raw Elo score", () => {
    expect(compact(rawModel({ gdpvalNormalized: 0.31 })).benchmarks?.gdpval).toBe(31);
    expect(compact(rawModel({ gdpval: 1866.27 })).benchmarks?.gdpval).toBeUndefined();
  });
});

describe("mergeBySlug", () => {
  const catalog = [
    { slug: "a", name: "A", intelligenceIndex: 1 },
    { slug: "b", name: "B" },
    { slug: "", name: "NoSlug" },
    { slug: "x" },
    { name: "y" },
  ];

  it("overlays enrichment fields, skipping ghosts and slugless/nameless rows", () => {
    const merged = mergeBySlug(catalog, [
      { slug: "a", medianOutputSpeed: 5 },
      { slug: "ghost", name: "Ghost" },
    ]);
    expect(merged.map((m) => m.slug)).toEqual(["a", "b"]);
    expect(merged[0]!.medianOutputSpeed).toBe(5);
    expect(merged[0]!.intelligenceIndex).toBe(1);
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
      aaModel({ slug: "d", name: "Model D", intelligence_index: null }),
      aaModel({ slug: "e", name: "Model E", agentic_index: null }),
    ];
    const filled = backfillFromMeta(models, {
      [normalizeModelKey("Model A")]: { agenticIndex: 55.4 },
      [normalizeModelKey("Model B")]: { agenticIndex: 99 },
      [normalizeModelKey("Unknown")]: { agenticIndex: 1 },
      [normalizeModelKey("Model D")]: { intelligenceIndex: 61.2 },
      [normalizeModelKey("Model E")]: { agenticIndex: 0.9 },
    });
    expect(filled).toBe(3);
    expect(models[0]).toMatchObject({ agentic_index: 55.4 });
    expect(models[1]).toMatchObject({ agentic_index: 40 });
    expect(models[2]).toMatchObject({ agentic_index: null });
    expect(models[3]!.intelligence_index).toBe(61.2);
    expect(models[4]).toMatchObject({ agentic_index: 0.9 });
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

function changelogReleases(): unknown[] {
  return [
    {
      slug: "claude-opus-4-5",
      name: "Claude Opus 4.5",
      deprecated: true,
      releaseDate: "2025-11-24",
      creator: { slug: "anthropic", name: "Anthropic", logo: "/img/logos/anthropic.svg" },
    },
    {
      slug: "llama-3-3",
      name: "Llama 3.3",
      deprecated: false,
      releaseDate: "2024-12-06",
      creator: { slug: "meta", name: "Meta", logo: "/img/logos/meta.svg" },
    },
  ];
}

function changelogHtml(): string {
  const models = [
    { slug: "claude-opus-4-5-thinking", name: "Claude Opus 4.5 (Reasoning)", releaseSlug: "claude-opus-4-5" },
    { slug: "claude-opus-4-5", name: "Claude Opus 4.5 (Non-reasoning)", releaseSlug: "claude-opus-4-5" },
    { slug: "llama-3-3-70b", name: "Llama 3.3 70B", releaseSlug: "llama-3-3" },
  ];
  const QUOTE = String.fromCharCode(34);
  const ESCAPED_QUOTE = String.fromCharCode(92, 34);
  const payload = JSON.stringify({ modelsAndReleases: { releases: changelogReleases() }, models })
    .split(QUOTE)
    .join(ESCAPED_QUOTE);
  return `<html><body><script>self.__next_f.push([1,"${payload}"])</script></body></html>`;
}

describe("parseChangelogModels", () => {
  it("extracts the models array from flight-escaped HTML, skipping deprecated releases", () => {
    const models = unwrap(parseChangelogModels(changelogHtml()));
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      slug: "llama-3-3-70b",
      releaseSlug: "llama-3-3",
      releaseName: "Llama 3.3",
      releaseDate: "2024-12-06",
      creatorName: "Meta",
    });
  });
});

function leaderboardHtml(rows: unknown[], links: unknown[], releases: unknown[]): string {
  // Upstream layout: the model matrix rides in an RSC JSON line under the
  // `initialModels` component prop, while the `"models"` script only carries
  // the slug/name/releaseSlug release links.
  const linksPayload = JSON.stringify({ models: links, modelsAndReleases: { releases } });
  return `<script>push([1,${linksPayload}])</script>\n2:${JSON.stringify({ initialModels: rows })}\n`;
}

describe("parseLeaderboardModels", () => {
  const releases = [
    {
      slug: "claude-opus-4-5",
      name: "Claude Opus 4.5",
      deprecated: false,
      releaseDate: "2025-11-24",
      creator: { slug: "anthropic", name: "Anthropic", logo: "/img/logos/anthropic.svg" },
    },
  ];
  const links = [
    { slug: "claude-opus-4-5-thinking", name: "Claude Opus 4.5 (Reasoning)", releaseSlug: "claude-opus-4-5" },
  ];
  const row = {
    slug: "claude-opus-4-5-thinking",
    name: "Claude Opus 4.5 (Reasoning)",
    shortName: "Opus 4.5 (thinking)",
    deprecated: false,
    isReasoning: true,
    isOpenWeights: false,
    paramClass: "large",
    modelCreatorName: "Anthropic",
    modelCreatorColor: "#cc785c",
    intelligenceIndex: 57.6,
    omniscience: 46.4,
    omniscienceAccuracy: 0.66,
    omniscienceNonHallucination: 0.414,
    price1mInputTokens: 4,
    price1mOutputTokens: 20,
    cacheHitPrice: 0.2,
    cacheWritePrice: 5,
    medianOutputTokensPerSecond: 146.5,
    terminalBench21: 0.6,
    gpqa: 0.83,
    gdpvalNormalized: 0.23,
  };

  it("normalizes leaderboard rows onto the index shape and joins the release date", () => {
    const rows = unwrap(parseLeaderboardModels(leaderboardHtml([row], links, releases)));
    expect(rows).toHaveLength(1);
    const first = rows[0]!;
    expect(compact(first)).toMatchObject({
      id: "claude-opus-4-5-thinking",
      slug: "claude-opus-4-5-thinking",
      name: "Claude Opus 4.5 (Reasoning)",
      short_name: "Opus 4.5 (thinking)",
      model_creators: { name: "Anthropic", color: "#cc785c" },
      intelligence_index: 57.6,
      release_date: "2025-11-24",
      size_class: "large",
      is_reasoning: true,
      pricing: { input: 4, output: 20, cacheHit: 0.2, cacheWrite: 5 },
      speed: { median_output_speed: 146.5 },
    });
    expect(compact(first).benchmarks).toMatchObject({ terminalbench_v2_1: 60, gpqa: 83 });
    // gdpval reads the normalized 0-1 ratio, not the raw Elo score.
    expect(compact(first).benchmarks?.gdpval).toBe(23);
    expect(compact(first).benchmarks?.gdpval).not.toBe(0.23);
    const total = compact(first).omniscience_breakdown?.total;
    expect(total?.accuracy).toBe(66);
    expect(total?.attempt_rate).toBeNull();
    expect(total?.hallucination_rate).toBeCloseTo(58.6, 10);
    expect(total?.omniscience).toBe(46.4);
  });

  it("drops deprecated rows and rows without a usable identity", () => {
    const rows = unwrap(
      parseLeaderboardModels(
        leaderboardHtml([row, { ...row, slug: "old-1", deprecated: true }, { slug: "", name: "" }], links, releases),
      ),
    );
    expect(rows.map((r) => r.slug)).toEqual(["claude-opus-4-5-thinking"]);
  });

  it("only asks for the benchmarks the leaderboard path serves", () => {
    // `gdpval` / `briefcaseElo` / `cweBench` live on the /models and /omniscience paths,
    // never on the leaderboard, so their absence must not be reported as a missing wire name.
    const result = parseLeaderboardModels(leaderboardHtml([row], links, releases));
    expect(result.ok).toBe(true);
    const warnings = result.ok ? result.warnings : [];
    const wireWarning = warnings.find((w) => w.includes("benchmark wire name")) ?? "";
    expect(wireWarning).not.toContain("gdpval");
    expect(wireWarning).not.toContain("briefcaseElo");
    expect(wireWarning).not.toContain("cweBench");
    // `hle` is served by the leaderboard, so its absence is reported.
    expect(wireWarning).toContain("hle");
  });

  it("warns when a benchmark the leaderboard does serve disappears upstream", () => {
    const withoutGpqa: Record<string, unknown> = { ...row };
    delete withoutGpqa.gpqa;
    const result = parseLeaderboardModels(leaderboardHtml([withoutGpqa], links, releases));
    const warnings = result.ok ? result.warnings : [];
    expect(warnings.some((w) => w.includes("gpqa"))).toBe(true);
  });

  it("fails when the initialModels prop is missing or not the model matrix", () => {
    const linksPayload = JSON.stringify({ models: [], modelsAndReleases: { releases } });
    // No initialModels prop at all.
    expect(parseLeaderboardModels(`<script>push([1,${linksPayload}])</script>\n`).ok).toBe(false);
    // Prop exists but resembles the release-link identifier list instead.
    expect(parseLeaderboardModels(leaderboardHtml([{ slug: "a", name: "A", releaseSlug: "a" }], [], releases)).ok).toBe(
      false,
    );
  });
});

describe("toClosedReleases", () => {
  it("dedupes variants by release family, newest first, keeping open-weight families", () => {
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
      "https://artificialanalysis.ai",
    );
    expect(entries.map((e) => e.id)).toEqual(["claude-opus-4-5", "mystery-1", "llama-3-3"]);
    expect(entries[0]).toMatchObject({
      model: "Claude Opus 4.5",
      provider: "Anthropic",
      releaseDate: "2025-11-24",
      link: "https://artificialanalysis.ai/models/claude-opus-4-5",
    });
  });
});
