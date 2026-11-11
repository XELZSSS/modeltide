import type { AppContext } from "@/server/api/context";
import { fanOut } from "@/server/fan-out";
import { getIntelligenceIndex } from "@/server/aa";
import { getCodingAgentRankings } from "@/server/aa/coding-agents";
import { getDecisionIndex } from "@/server/aa/decision";
import { getHomeOpenSourceModels } from "@/server/huggingface/source";
import { getCursorBench } from "@/server/cursorbench/source";
import { getOpenRouterRankings } from "@/server/openrouter/rankings";
import { FIVE_MINUTES, OPEN_SOURCE_MODELS_DEFAULTS } from "@/shared/config";
import { cacheKeys } from "@/server/cache/keys";
import type {
  ArtificialAnalysisModel,
  CursorBenchEntry,
  DecisionIndexEntry,
  HomeChartPoint,
  HomeDashboardData,
  HomeDecisionPoint,
  HomeHallucinationPoint,
  HomeProviderSpeed,
  HomeUsagePoint,
  OpenRouterRankEntry,
} from "@/shared/types";
import { computeProviderStats } from "@/shared/utils/models";
import { aggregateTaskShare } from "@/shared/utils";
import {
  HOME_CHART_ROWS,
  HOME_CURSORBENCH_ROWS,
  HOME_DECISION_ROWS,
  HOME_HALLUCINATION_ROWS,
  HOME_OPEN_SOURCE_ROWS,
  HOME_PROVIDER_ROWS,
  HOME_CODING_AGENT_ROWS,
  HOME_USAGE_ROWS,
} from "@/shared/config/ui";
import { definePartialSource, type PartialData } from "@/server/pipeline";
import { byNumberDesc } from "@/server/formats/ordering";

/** The overview chart's rows: AA's intelligence index, highest first, sliced to the bar count. A model without an index cannot be drawn, so it is dropped here. */
function homeIntelligenceRows(models: ArtificialAnalysisModel[]): HomeChartPoint[] {
  const rows: HomeChartPoint[] = [];
  for (const model of models) {
    if (model.intelligence_index == null) continue;
    rows.push({ id: model.id, name: model.name, score: model.intelligence_index });
  }
  return rows.sort(byNumberDesc<HomeChartPoint>((row) => row.score)).slice(0, HOME_CHART_ROWS);
}

/** The coding card's rows: CursorBench's own pass-rate ranking, a second coding dataset from a different source than AA's coding-agent index. */
function homeCodingRows(entries: CursorBenchEntry[]): HomeChartPoint[] {
  return entries.slice(0, HOME_CURSORBENCH_ROWS).map(({ id, model, score }) => ({ id, name: model, score }));
}

/** The usage card's rows, highest total tokens first: the OpenRouter payload keeps the upstream's own order, which is not guaranteed to be by volume. */
function homeUsageRows(entries: OpenRouterRankEntry[]): HomeUsagePoint[] {
  const rows = entries.map(({ id, name, totalTokens }) => ({ id, name, totalTokens }));
  return rows.sort(byNumberDesc<HomeUsagePoint>((row) => row.totalTokens)).slice(0, HOME_USAGE_ROWS);
}

/** The decision card's rows: that source already returns its rows by index, so this only slices. */
function homeDecisionRows(entries: DecisionIndexEntry[]): HomeDecisionPoint[] {
  return entries.slice(0, HOME_DECISION_ROWS).map(({ id, name, index }) => ({ id, name, index }));
}

function homeProviderRows(models: ArtificialAnalysisModel[]): HomeProviderSpeed[] {
  // `computeProviderStats` labels an unknown creator with "", which the payload does not: it sends `null` and lets the client translate.
  return computeProviderStats(models, "")
    .filter((p): p is typeof p & { avgSpeed: number } => p.avgSpeed != null)
    .sort(byNumberDesc<HomeProviderSpeed>((provider) => provider.avgSpeed))
    .slice(0, HOME_PROVIDER_ROWS)
    .map(({ name, color, avgSpeed }) => ({ name: name || null, color, avgSpeed }));
}

function homeHallucinationRows(models: ArtificialAnalysisModel[]): HomeHallucinationPoint[] {
  const rows: HomeHallucinationPoint[] = [];
  for (const model of models) {
    const total = model.omniscience_breakdown?.total;
    // Same rule as the hallucination ranking: an entry needs both an index and an accuracy.
    if (total?.omniscience == null || total.accuracy == null) continue;
    rows.push({ name: model.name, accuracy: total.accuracy });
  }
  return rows.sort(byNumberDesc<HomeHallucinationPoint>((row) => row.accuracy)).slice(0, HOME_HALLUCINATION_ROWS);
}

async function fetchHomeDashboard(ctx: AppContext): Promise<PartialData<HomeDashboardData>> {
  const { values, failures } = await fanOut(
    ctx,
    [
      { label: "codingAgents", run: () => getCodingAgentRankings(ctx) },
      { label: "opensource", run: () => getHomeOpenSourceModels(ctx, { ...OPEN_SOURCE_MODELS_DEFAULTS }) },
      { label: "artificial", run: () => getIntelligenceIndex(ctx) },
      { label: "cursorBench", run: () => getCursorBench(ctx) },
      { label: "openRouter", run: () => getOpenRouterRankings(ctx) },
      { label: "decision", run: () => getDecisionIndex(ctx) },
    ],
    // Every leg returns a payload object on success, so "all legs rejected" is exactly "every value is missing".
    { tag: "home", allFailedMessage: "Home dashboard: all sources failed" },
  );
  const [codingAgents, opensource, artificial, cursorBench, openRouter, decision] = values;
  const artificialModels = artificial?.payload.data ?? [];
  const openSourceModels = opensource?.payload.data ?? [];
  const data: HomeDashboardData = {
    codingAgents: (codingAgents?.payload.data ?? []).slice(0, HOME_CODING_AGENT_ROWS),
    opensource: openSourceModels
      .slice(0, HOME_OPEN_SOURCE_ROWS)
      .map(({ id, downloads, task }) => ({ id, downloads, task })),
    openSourceTasks: aggregateTaskShare(openSourceModels).slices,
    intelligence: homeIntelligenceRows(artificialModels),
    providers: homeProviderRows(artificialModels),
    hallucinations: homeHallucinationRows(artificialModels),
    coding: homeCodingRows(cursorBench?.payload.data ?? []),
    usage: homeUsageRows(openRouter?.payload.data ?? []),
    decision: homeDecisionRows(decision?.payload.data ?? []),
  };
  // A failed leg is `undefined` in `values` (`runLegs` drops rejections): this covers a lost leg and a degraded one.
  const partial = values.some((v) => v == null || v.payload.partial);
  if (partial && failures.length === 0) {
    ctx.log("warn", "[home] partial dashboard (a leg returned partial data)");
  }
  return { data, partial };
}
export const getHomeDashboard = definePartialSource<HomeDashboardData>({
  key: cacheKeys.homeDashboard,
  ttl: FIVE_MINUTES,
  label: "Home dashboard",
  served: true,
  fetch: (ctx) => fetchHomeDashboard(ctx),
});
