import type { AppContext } from "@/server/context";
import { DEFAULT_TTL_MS } from "@/shared/config";
import { cacheKeys } from "@/server/config";
import type { TextToImageModel, TextToImagePayload } from "@/shared/types";
import { findLongestData, findNextData, parseRscPayload } from "@/server/parsers/rsc";
import { UpstreamError, zeroUpstream } from "@/server/infra/errors";
import { errMsg } from "@/server/infra/pool";
import { dedupeBy } from "@/shared/utils";
import { num, numNonNegative, strOrNull } from "@/server/parsers/primitives";
import { byNumberDesc, withRanks } from "@/server/parsers/shaping";
import { isValidTextToImageEntry } from "@/server/sources/data-filter";
import { fetchAaRsc } from "@/server/sources/aa/fetch";

export interface RawEntry {
  id?: unknown;
  slug?: unknown;
  name?: unknown;
  elo?: unknown;
  lower95ci?: unknown;
  upper95ci?: unknown;
  price?: unknown;
  creator?: unknown;
}

/** Parsed entry; `rank` is assigned from elo order in `getTextToImageLeaderboard`. */
export function mapEntry(raw: RawEntry): Omit<TextToImageModel, "rank"> | null {
  const id = strOrNull(raw.id);
  const slug = strOrNull(raw.slug);
  const name = strOrNull(raw.name);
  const elo = num(raw.elo);
  if (!isValidTextToImageEntry({ id, slug, name, elo })) return null;
  const creator = raw.creator as Record<string, unknown> | null | undefined;

  return {
    id: id as string,
    slug: slug as string,
    name: (name as string).trim(),
    elo: elo as number,
    eloLower: num(raw.lower95ci),
    eloUpper: num(raw.upper95ci),
    pricePer1kImages: numNonNegative(raw.price),
    creatorName: creator ? strOrNull(creator.name) : null,
  };
}

export const TEXT_TO_IMAGE_PATH = "/image/models";

export const getTextToImageLeaderboard = (ctx: AppContext): Promise<TextToImagePayload> =>
  ctx.cache.withTtl(cacheKeys.textToImage, DEFAULT_TTL_MS, async () => {
    let body: string;
    try {
      body = await fetchAaRsc(ctx, TEXT_TO_IMAGE_PATH);
    } catch (err) {
      throw new UpstreamError(`Text-to-image fetch failed: ${errMsg(err)}`);
    }
    if (!body) {
      throw new UpstreamError("Text-to-image returned an empty body");
    }
    let rawModels: Record<string, unknown>[] | null = null;
    try {
      rawModels = parseRscPayload<Record<string, unknown>>(
        body,
        "textToImage",
        (tree) => findLongestData(tree, "textToImage") ?? findNextData(tree, "textToImage"),
      );
    } catch {
      rawModels = null;
    }
    if (!rawModels || rawModels.length === 0) {
      throw zeroUpstream("Text-to-image", "raw rows", `raw=0, kept=0, body=${body.length}B`);
    }
    const mapped = rawModels
      .map((m) => mapEntry(m as RawEntry))
      .filter((m): m is Omit<TextToImageModel, "rank"> => m !== null);
    const ranked = dedupeBy([...mapped].sort(byNumberDesc((m) => m.elo)), (m) => m.slug);
    // Upstream sends no rank: derive it from elo order.
    const models: TextToImageModel[] = withRanks(ranked);
    if (models.length === 0) {
      throw zeroUpstream("Text-to-image", "models", `raw=${rawModels.length}, kept=0`);
    }
    return { data: { models, fetchedAt: new Date().toISOString() } };
  });
