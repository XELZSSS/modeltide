import type { AppContext } from "@/server/api/context";
import { UpstreamError } from "@/server/api/errors";
import { fanOut } from "@/server/fan-out";
import { getIntelligenceIndexResult } from "@/server/aa";
import { getTextToImageLeaderboard } from "@/server/aa/text-to-image";
import { getHomeOpenSourceModels } from "@/server/huggingface/source";
import { getOpenRouterRankings } from "@/server/openrouter/rankings";
import { FIVE_MINUTES, OPEN_SOURCE_MODELS_DEFAULTS } from "@/shared/config";
import { cacheKeys } from "@/server/cache/keys";
import type {
  ArtificialAnalysisModel,
  HomeChartPoint,
  HomeDashboardData,
  HomeHallucinationPoint,
  HomeOpenSourceEntry,
  HomeProviderSpeed,
  OpenSourceModelEntry,
  SourcePayload,
} from "@/shared/types";
import { computeProviderStats } from "@/shared/utils/models";
import { cachedPayload } from "@/server/pipeline";

const HOME_OR_RANKING_ROWS = 5;
const HOME_TEXT_TO_IMAGE_ROWS = 8;
const HOME_CHART_ROWS = 10;
const HOME_PROVIDER_ROWS = 5;
const HOME_HALLUCINATION_ROWS = 5;

function homeOpenSourceRow({ id, downloads, task }: OpenSourceModelEntry): HomeOpenSourceEntry {
  return { id, downloads, task };
}

/** Top models by intelligence, pre-sliced so the home page never needs the full 272-row index. */
function homeChartRows(models: ArtificialAnalysisModel[]): HomeChartPoint[] {
  return models
    .filter(
      (m): m is ArtificialAnalysisModel & { intelligence_index: number; coding_index: number } =>
        typeof m.intelligence_index === "number" &&
        Number.isFinite(m.intelligence_index) &&
        typeof m.coding_index === "number" &&
        Number.isFinite(m.coding_index),
    )
    .sort((a, b) => b.intelligence_index - a.intelligence_index)
    .slice(0, HOME_CHART_ROWS)
    .map((m) => ({
      id: m.id,
      name: m.name,
      shortName: m.short_name,
      intelligence: m.intelligence_index,
      coding: m.coding_index,
    }));
}

function homeProviderRows(models: ArtificialAnalysisModel[]): HomeProviderSpeed[] {
  // The unknown-provider label is filled in client-side, where translations live.
  return computeProviderStats(models, "")
    .filter((p): p is typeof p & { avgSpeed: number } => p.avgSpeed != null)
    .sort((a, b) => b.avgSpeed - a.avgSpeed)
    .slice(0, HOME_PROVIDER_ROWS)
    .map(({ name, color, avgSpeed }) => ({ name, color, avgSpeed }));
}

function homeHallucinationRows(models: ArtificialAnalysisModel[]): HomeHallucinationPoint[] {
  const rows: HomeHallucinationPoint[] = [];
  for (const model of models) {
    const total = model.omniscience_breakdown?.total;
    // Same rule as the hallucination ranking: an entry needs both an index and an accuracy.
    if (total?.omniscience == null || total.accuracy == null) continue;
    rows.push({ model: model.name, accuracy: total.accuracy });
  }
  return rows.sort((a, b) => b.accuracy - a.accuracy).slice(0, HOME_HALLUCINATION_ROWS);
}

async function fetchHomeDashboard(ctx: AppContext): Promise<{ data: HomeDashboardData; partial: boolean }> {
  const {
    values,
    failures,
    partial: legPartial,
    reasons,
  } = await fanOut(
    ctx,
    [
      { label: "openrouter", run: () => getOpenRouterRankings(ctx) },
      { label: "textToImage", run: () => getTextToImageLeaderboard(ctx) },
      { label: "opensource", run: () => getHomeOpenSourceModels(ctx, { ...OPEN_SOURCE_MODELS_DEFAULTS }) },
      { label: "artificial", run: () => getIntelligenceIndexResult(ctx) },
    ],
    { tag: "home" },
  );
  const [orRankings, textToImage, opensource, artificial] = values;
  if (!orRankings && !textToImage && !opensource && !artificial) {
    throw new UpstreamError(`Home dashboard: all sources failed (${reasons})`, { retryable: true });
  }
  const artificialModels = artificial?.models ?? [];
  const data: HomeDashboardData = {
    orRankings: (orRankings?.data ?? []).slice(0, HOME_OR_RANKING_ROWS),
    textToImage: (textToImage?.data ?? []).slice(0, HOME_TEXT_TO_IMAGE_ROWS),
    opensource: (opensource?.data ?? []).map(homeOpenSourceRow),
    chart: homeChartRows(artificialModels),
    providers: homeProviderRows(artificialModels),
    hallucinations: homeHallucinationRows(artificialModels),
  };
  const partial =
    legPartial ||
    orRankings?.partial === true ||
    textToImage?.partial === true ||
    opensource?.partial === true ||
    artificial?.enrichFailed === true;
  if (partial && failures.length === 0) {
    ctx.log("warn", "[home] partial dashboard (a leg returned partial data)");
  }
  return { data, partial };
}

export async function getHomeDashboard(ctx: AppContext): Promise<SourcePayload<HomeDashboardData>> {
  return cachedPayload(ctx, cacheKeys.homeDashboard, FIVE_MINUTES, async (ctx) => {
    const { data, partial } = await fetchHomeDashboard(ctx);
    return { rows: data, partial };
  });
}
