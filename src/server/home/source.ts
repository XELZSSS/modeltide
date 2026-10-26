import type { AppContext } from "@/server/api/context";
import { fanOut } from "@/server/fan-out";
import { getIntelligenceIndex } from "@/server/aa";
import { getTextToImageLeaderboard } from "@/server/aa/text-to-image";
import { getHomeOpenSourceModels } from "@/server/huggingface/source";
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
} from "@/shared/types";
import { computeProviderStats } from "@/shared/utils/models";
import { isFiniteNumber } from "@/shared/utils/number";
import { aggregateTaskShare } from "@/shared/utils";
import {
  HOME_CHART_ROWS,
  HOME_HALLUCINATION_ROWS,
  HOME_OPEN_SOURCE_ROWS,
  HOME_PROVIDER_ROWS,
  HOME_TEXT_TO_IMAGE_ROWS,
} from "@/shared/config/ui";
import { definePartialSource } from "@/server/pipeline";

function homeOpenSourceRow({ id, downloads, task }: OpenSourceModelEntry): HomeOpenSourceEntry {
  return { id, downloads, task };
}

/**
 * Top models by the coding index, pre-sliced so the home page never needs the full index payload. Both indices are
 * required: the card draws the two as a pair, and a row carrying only one of them is a bar the chart cannot complete.
 */
function homeChartRows(models: ArtificialAnalysisModel[]): HomeChartPoint[] {
  return models
    .filter(
      (m): m is ArtificialAnalysisModel & { intelligence_index: number; coding_index: number } =>
        isFiniteNumber(m.intelligence_index) && isFiniteNumber(m.coding_index),
    )
    .sort((a, b) => b.coding_index - a.coding_index)
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
  // `computeProviderStats` labels an unknown creator with "", which the payload does not: it sends `null` and lets the
  // client fill in the translated label, the only layer that can.
  return computeProviderStats(models, "")
    .filter((p): p is typeof p & { avgSpeed: number } => p.avgSpeed != null)
    .sort((a, b) => b.avgSpeed - a.avgSpeed)
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
  return rows.sort((a, b) => b.accuracy - a.accuracy).slice(0, HOME_HALLUCINATION_ROWS);
}

interface HomeRaw {
  data: HomeDashboardData;
  partial: boolean;
}

async function fetchHomeDashboard(ctx: AppContext): Promise<HomeRaw> {
  const { values, failures } = await fanOut(
    ctx,
    [
      { label: "textToImage", run: () => getTextToImageLeaderboard(ctx) },
      { label: "opensource", run: () => getHomeOpenSourceModels(ctx, { ...OPEN_SOURCE_MODELS_DEFAULTS }) },
      { label: "artificial", run: () => getIntelligenceIndex(ctx) },
    ],
    // Every leg returns a payload object on success, so "all legs rejected" is exactly "every value is missing": the
    // shared policy in runLegs replaces the hand-written null check this used to do after the fan-out returned.
    { tag: "home", allFailedMessage: "Home dashboard: all sources failed" },
  );
  const [textToImage, opensource, artificial] = values;
  const artificialModels = artificial?.payload.data ?? [];
  const openSourceModels = opensource?.payload.data ?? [];
  const data: HomeDashboardData = {
    textToImage: (textToImage?.payload.data ?? []).slice(0, HOME_TEXT_TO_IMAGE_ROWS),
    opensource: openSourceModels.slice(0, HOME_OPEN_SOURCE_ROWS).map(homeOpenSourceRow),
    openSourceTasks: aggregateTaskShare(openSourceModels).slices,
    chart: homeChartRows(artificialModels),
    providers: homeProviderRows(artificialModels),
    hallucinations: homeHallucinationRows(artificialModels),
  };
  // A failed leg is `undefined` in `values` (`runLegs` drops rejections): this covers a lost leg and a degraded one.
  const partial = values.some((v) => v == null || v.payload.partial);
  if (partial && failures.length === 0) {
    ctx.log("warn", "[home] partial dashboard (a leg returned partial data)");
  }
  return { data, partial };
}
export const getHomeDashboard = definePartialSource<HomeRaw, HomeDashboardData>({
  key: cacheKeys.homeDashboard,
  ttl: FIVE_MINUTES,
  label: "Home dashboard",
  served: true,
  fetch: (ctx) => fetchHomeDashboard(ctx),
  pick: (raw) => raw.data,
});
