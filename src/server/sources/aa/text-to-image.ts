import type { AppContext } from "@/server/context";
import { DEFAULT_TTL_MS } from "@/shared/config";
import { cacheKeys, upstreamEndpoints } from "@/server/config";
import type { TextToImageModel, TextToImagePayload } from "@/shared/types";
import { findLongestData, findNextData, parseRscPayload } from "@/server/parsers/rsc";
import { UpstreamError, zeroUpstream } from "@/server/infra/errors";
import { errMsg } from "@/server/infra/pool";
import { dedupeBy } from "@/shared/utils";
import { byNumberDesc } from "@/server/parsers/shaping";
import type { RawEntry } from "@/server/parsers/aa-text-to-image";
import { mapEntry } from "@/server/parsers/aa-text-to-image";
import { fetchAaRsc } from "@/server/sources/aa/fetch";

export const getTextToImageLeaderboard = (ctx: AppContext): Promise<TextToImagePayload> =>
  ctx.cache.withTtl(cacheKeys.textToImage, DEFAULT_TTL_MS, async () => {
    let body: string;
    try {
      body = await fetchAaRsc(ctx, upstreamEndpoints.aaTextToImage);
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
    const models: TextToImageModel[] = ranked.map((m, i) => ({ ...m, rank: i + 1 }));
    if (models.length === 0) {
      throw zeroUpstream("Text-to-image", "models", `raw=${rawModels.length}, kept=0`);
    }
    return { data: { models, fetchedAt: new Date().toISOString() } };
  });
