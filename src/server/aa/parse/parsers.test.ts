import { describe, expect, it, beforeEach } from "vitest";
import { resetModuleCachesForTests } from "@/server/cache/service";
import { backfillFromMeta } from "./meta-backfill";
import { mergeBySlug } from "./model-merge";
import { compact } from "./model-compact";
import { parseLeaderboardModels } from "./leaderboard";
import { parseChangelogModels } from "./changelog";
import { mapEntry, parseCodingAgentsRows } from "./coding-agents";
import type { AaCodingAgentRow, ChangelogModel } from "../wire";

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
    slug: "gpt-6-1-sol",
    name: "GPT-6.1 Sol (Max)",
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
    outputSpeed: 120,
    releaseDate: "2026-09-22",
    inputModalityText: true,
    outputModalityText: true,
    omniscience: 0.9,
    omniscienceBreakdown: { accuracy: 0.88, attemptRate: 0.7, hallucinationRate: 0.1 },
    ...over,
  };
}

type CompactReader = (m: ArtificialAnalysisModel) => unknown;

/** One row per upstream quirk `compact` normalizes, with the value the public field has to end up carrying. */
const COMPACT_QUIRKS: [string, Record<string, unknown>, CompactReader, unknown][] = [
  ["keeps the GDPval Elo instead of inventing a percentage", { gdpval: 1586.76 }, (m) => m.benchmarks?.gdpval, 1586.76],
  ["ignores the normalized GDPval alias", { gdpvalNormalized: 0.31 }, (m) => m.benchmarks?.gdpval, undefined],
  ["accepts the itBenchSre spelling", { itBenchSre: 0.44 }, (m) => m.benchmarks?.itbench_sre, 0.44],
  ["accepts the itbenchSre spelling", { itbenchSre: 0.44 }, (m) => m.benchmarks?.itbench_sre, 0.44],
  ["keeps a signed omniscience index", { omniscience: -5.3 }, (m) => m.benchmarks?.omniscience, -5.3],
  [
    "keeps the signed omniscience in the breakdown total",
    { omniscience: -5.3 },
    (m) => m.omniscience_breakdown?.total?.omniscience,
    -5.3,
  ],
  ["averages coding when at least one sub-score is present", { terminalBench21: null }, (m) => m.coding_index, 60],
  ["drops coding when no sub-score is present", { terminalBench21: null, scicode: null }, (m) => m.coding_index, null],
  ["drops an invalid release date", { releaseDate: "not-a-date" }, (m) => m.release_date, null],
];

describe("compact", () => {
  it("projects the raw upstream record onto the public model shape", () => {
    expect(compact(rawModel())).toMatchObject({
      id: "m1",
      slug: "gpt-6-1-sol",
      name: "GPT-6.1 Sol (Max)",
      model_creators: { name: "OpenAI", color: "#000000" },
      intelligence_index: 80,
      is_reasoning: true,
      is_open_weights: false,
      agentic_index: 72,
      coding_index: 70,
      release_date: "2026-09-22",
      pricing: { input: 1.5, output: 6, cacheHit: 0.75, cacheWrite: null },
      speed: { median_output_speed: 120 },
    });
    expect(compact(rawModel()).omniscience_breakdown?.total).toEqual({
      accuracy: 0.88,
      attempt_rate: 0.7,
      hallucination_rate: 0.1,
      omniscience: 0.9,
    });
    expect(compact(rawModel()).benchmarks).toMatchObject({
      terminalbench_v2_1: 0.8,
      terminalbench_hard: 0.7,
      terminalbench_v4_0: 0.9,
      omniscience: 0.9,
    });
  });

  it.each(COMPACT_QUIRKS)("%s", (_label, over, read, expected) => {
    expect(read(compact(rawModel(over)))).toBe(expected);
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
      { slug: "a", shortName: "A2" },
      { slug: "ghost", name: "Ghost" },
    ]);
    expect(merged.map((m) => m.slug)).toEqual(["a", "b"]);
    expect(merged[0]!.shortName).toBe("A2");
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

describe("mapEntry (coding agents)", () => {
  const base: AaCodingAgentRow = {
    id: "9983e10d68576074ad63407d0ca81e4b",
    agentName: "Claude Code",
    model: { shortName: "Claude Sonnet 5.5 (max with fallback)" },
    agentCreator: { name: "Anthropic" },
    indexScore: 0.593,
  };

  it("maps the agent, its creator, the model it drove and the index on AA's 0-100 scale", () => {
    const entry = mapEntry(base);
    expect(entry).toMatchObject({
      id: "9983e10d68576074ad63407d0ca81e4b",
      agent: "Claude Code",
      creator: "Anthropic",
      model: "Claude Sonnet 5.5 (max with fallback)",
    });
    expect(entry?.score).toBeCloseTo(59.3, 10);
  });

  it.each<[string, Partial<AaCodingAgentRow>]>([
    ["a row without an index score", { indexScore: null }],
    ["a row whose score left the 0-1 range", { indexScore: 59.3 }],
    ["a row without an agent name", { agentName: null }],
  ])("drops %s", (_label, over) => {
    expect(mapEntry({ ...base, ...over })).toBeNull();
  });

  it("takes the model from display.model when a router pairing carries no model object", () => {
    const entry = mapEntry({
      id: "router",
      agentName: "GitHub Copilot",
      model: null,
      display: { agent: "GitHub Copilot", model: "Copilot Fusion (max)" },
      indexScore: 0.599,
    });
    expect(entry?.model).toBe("Copilot Fusion (max)");
  });
  it("merges the table prop with the highlighted array its references point at", () => {
    const tableRow = { id: "a", agentName: "Devin Fusion CLI", indexScore: 0.615 };
    const highlighted = {
      id: "b",
      agentName: "Claude Code",
      indexScore: 0.617,
      model: { shortName: "Claude Opus 5.5" },
    };
    const body = [
      `2:${JSON.stringify({ benchmarkRows: [tableRow, "$32:props:children:props:rows:0"] })}`,
      `3:${JSON.stringify({ rows: [highlighted] })}`,
    ].join("\n");
    const entries = unwrap(parseCodingAgentsRows(body));
    // The reference string carries no fields: the row it points at arrives through the `rows` marker itself.
    expect(entries.map((entry) => entry.agent)).toEqual(["Devin Fusion CLI", "Claude Code"]);
    expect(entries[1]!.score).toBeCloseTo(61.7, 10);
  });
});

function clModel(over: Partial<ChangelogModel> = {}): ChangelogModel {
  return {
    slug: "claude-opus-5-5-high",
    name: "Claude Opus 5.5 (High)",
    releaseSlug: "claude-opus-5-5",
    releaseName: "Claude Opus 5.5",
    releaseDate: "2026-09-21",
    creatorName: "Anthropic",
    ...over,
  };
}

/** The creator record both AA page seeds carry, and the two record shapes they share. */
const ANTHROPIC_CREATOR = { slug: "anthropic", name: "Anthropic", logo: "/img/logos/anthropic.svg" };
const modelLink = (slug: string, name: string, releaseSlug: string) => ({ slug, name, releaseSlug });
const claudeOpusRelease = (deprecated: boolean) => ({
  slug: "claude-opus-5-5",
  name: "Claude Opus 5.5",
  deprecated,
  releaseDate: "2026-09-21",
  creator: ANTHROPIC_CREATOR,
});

function changelogReleases(): unknown[] {
  return [
    claudeOpusRelease(true),
    {
      slug: "deepseek-v4-1-flash",
      name: "DeepSeek V4.1 Flash",
      deprecated: false,
      releaseDate: "2026-10-17",
      creator: { slug: "deepseek", name: "DeepSeek", logo: "/img/logos/deepseek.svg" },
    },
  ];
}

function changelogHtml(): string {
  const models = [
    modelLink("claude-opus-5-5-high", "Claude Opus 5.5 (High)", "claude-opus-5-5"),
    modelLink("claude-opus-5-5", "Claude Opus 5.5 (Max, Default Fallback)", "claude-opus-5-5"),
    modelLink("deepseek-v4-1-flash-1017", "DeepSeek V4.1 Flash 1017", "deepseek-v4-1-flash"),
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
      slug: "deepseek-v4-1-flash-1017",
      releaseSlug: "deepseek-v4-1-flash",
      releaseName: "DeepSeek V4.1 Flash",
      releaseDate: "2026-10-17",
      creatorName: "DeepSeek",
    });
  });
});

function leaderboardHtml(rows: unknown[], links: unknown[], releases: unknown[]): string {
  const linksPayload = JSON.stringify({ models: links, modelsAndReleases: { releases } });
  return `<script>push([1,${linksPayload}])</script>\n2:${JSON.stringify({ initialModels: rows })}\n`;
}

describe("parseLeaderboardModels", () => {
  const releases = [claudeOpusRelease(false)];
  const links = [modelLink("claude-opus-5-5-high", "Claude Opus 5.5 (High)", "claude-opus-5-5")];
  const row = {
    slug: "claude-opus-5-5-high",
    name: "Claude Opus 5.5 (High)",
    shortName: "Opus 5.5 (high)",
    deprecated: false,
    isReasoning: true,
    isOpenWeights: false,
    paramClass: "large",
    modelCreatorName: "Anthropic",
    modelCreatorColor: "#cc785c",
    intelligenceIndex: 57.6,
    omniscience: 46.4,
    price1mInputTokens: 4,
    price1mOutputTokens: 20,
    cacheHitPrice: 0.2,
    cacheWritePrice: 5,
    outputSpeed: 146.5,
    // The leaderboard files benchmarks under `scores`, keyed by the upstream's kebab-case evaluation names. Reading
    // the camelCase fields off the row dropped every benchmark for the models the enrichment pages do not cover.
    scores: {
      "terminalbench-2-1": 0.6,
      "gpqa-diamond": 0.83,
      "gdpval-aa-normalized": 1586.76,
      "aa-analyst-agent": 0.72,
      "omniscience-accuracy": 0.66,
      "omniscience-non-hallucination": 0.414,
    },
  };

  const leaderboardBody = (rows: unknown[] = [row], modelLinks: unknown[] = links) =>
    leaderboardHtml(rows, modelLinks, releases);

  it("normalizes leaderboard rows onto the index shape and joins the release date", () => {
    const rows = unwrap(parseLeaderboardModels(leaderboardBody()));
    expect(rows).toHaveLength(1);
    const first = rows[0]!;
    expect(compact(first)).toMatchObject({
      id: "claude-opus-5-5-high",
      slug: "claude-opus-5-5-high",
      name: "Claude Opus 5.5 (High)",
      short_name: "Opus 5.5 (high)",
      model_creators: { name: "Anthropic", color: "#cc785c" },
      intelligence_index: 57.6,
      agentic_index: 72,
      release_date: "2026-09-21",
      size_class: "large",
      is_reasoning: true,
      pricing: { input: 4, output: 20, cacheHit: 0.2, cacheWrite: 5 },
      speed: { median_output_speed: 146.5 },
    });
    expect(compact(first).benchmarks).toMatchObject({ terminalbench_v2_1: 0.6, gpqa: 0.83 });
    // The leaderboard files the same Elo under `gdpval-aa-normalized`; the public field keeps it as an absolute score.
    expect(compact(first).benchmarks?.gdpval).toBe(1586.76);
    const total = compact(first).omniscience_breakdown?.total;
    expect(total?.accuracy).toBe(0.66);
    expect(total?.attempt_rate).toBeNull();
    expect(total?.hallucination_rate).toBeCloseTo(0.586, 10);
    expect(total?.omniscience).toBe(46.4);
  });

  it("reads the output speed AA sends", () => {
    const rows = unwrap(parseLeaderboardModels(leaderboardBody()));
    expect(compact(rows[0]!).speed).toEqual({ median_output_speed: 146.5 });
  });

  it("drops deprecated rows and rows without a usable identity", () => {
    const rows = unwrap(
      parseLeaderboardModels(
        leaderboardHtml([row, { ...row, slug: "old-1", deprecated: true }, { slug: "", name: "" }], links, releases),
      ),
    );
    expect(rows.map((r) => r.slug)).toEqual(["claude-opus-5-5-high"]);
  });

  it("warns only about the benchmarks the leaderboard path serves", () => {
    const served = parseLeaderboardModels(leaderboardBody());
    expect(served.ok).toBe(true);
    const wireWarning = (served.ok ? served.warnings : []).find((w) => w.includes("benchmark wire name")) ?? "";
    expect(wireWarning).not.toContain("gdpval");
    expect(wireWarning).not.toContain("briefcaseElo");
    expect(wireWarning).not.toContain("cweBench");
    expect(wireWarning).toContain("hle");

    // A benchmark this path does serve still warns once upstream stops sending it.
    const scores: Record<string, unknown> = { ...row.scores };
    delete scores["gpqa-diamond"];
    const dropped = parseLeaderboardModels(leaderboardBody([{ ...row, scores }]));
    expect(dropped.ok && dropped.warnings.some((w) => w.includes("gpqa"))).toBe(true);
  });

  it("fails when the initialModels prop is missing or not the model matrix", () => {
    const linksPayload = JSON.stringify({ models: [], modelsAndReleases: { releases } });
    expect(parseLeaderboardModels(`<script>push([1,${linksPayload}])</script>\n`).ok).toBe(false);
    expect(parseLeaderboardModels(leaderboardHtml([{ slug: "a", name: "A", releaseSlug: "a" }], [], releases)).ok).toBe(
      false,
    );
  });
});

describe("toClosedReleases", () => {
  it("keeps one row per variant, newest release first", () => {
    const deepseekRelease = {
      releaseSlug: "deepseek-v4-1-flash-1017",
      releaseName: "DeepSeek V4.1 Flash 1017",
      releaseDate: "2026-10-17",
      creatorName: "DeepSeek",
    };
    const entries = toClosedReleases(
      [
        clModel(),
        clModel({ slug: "claude-opus-5-5", name: "Claude Opus 5.5 (Max, Default Fallback)" }),
        clModel({ slug: "deepseek-v4-1-flash-1017", name: "DeepSeek V4.1 Flash 1017 (Max)", ...deepseekRelease }),
        clModel({
          slug: "deepseek-v4-1-flash-1017-non-reasoning",
          name: "DeepSeek V4.1 Flash 1017 (Non-reasoning)",
          ...deepseekRelease,
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
    expect(entries.map((e) => e.id)).toEqual([
      "deepseek-v4-1-flash-1017",
      "deepseek-v4-1-flash-1017-non-reasoning",
      "claude-opus-5-5-high",
      "claude-opus-5-5",
      "mystery-1",
    ]);
    // Two variants of one release are two rows, each labelled with its own name.
    expect(entries.filter((e) => e.releaseDate === "2026-10-17").map((e) => e.model)).toEqual([
      "DeepSeek V4.1 Flash 1017 (Max)",
      "DeepSeek V4.1 Flash 1017 (Non-reasoning)",
    ]);
    // The row is its model page: AA serves `claude-opus-5-5-high`, and a release slug only coincides with a page for some
    // releases.
    const claude = entries.find((e) => e.id === "claude-opus-5-5-high")!;
    expect(claude).toMatchObject({
      model: "Claude Opus 5.5 (High)",
      provider: "Anthropic",
      releaseDate: "2026-09-21",
      link: "https://artificialanalysis.ai/models/claude-opus-5-5-high",
    });
  });
});
