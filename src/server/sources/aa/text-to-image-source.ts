import { byNumberDesc } from "@/server/parsers/parser-primitives";
import type { AppContext } from "@/server/context";
import { DEFAULT_TTL_MS } from "@/shared/config";
import { cacheKeys, upstreamEndpoints } from "@/server/config";
import type { TextToImageModel } from "@/shared/types";
import type { SourcePayload } from "@/shared/types";
import { findLongestData, findNextData, parseRscPayload } from "@/server/parsers/rsc-parser";
import { UpstreamError, wrapUpstream, zeroUpstream } from "@/server/infra/errors";
import { dedupeBy } from "@/shared/utils";

import { mapEntry } from "@/server/parsers/aa";
import { fetchAaRsc } from "@/server/sources/aa/aa-fetch";
import { cachedSource, sourcePayload } from "@/server/sources/pipeline";

export const getTextToImageLeaderboard = (ctx: AppContext): Promise<SourcePayload<TextToImageModel[]>> =>
  cachedSource(ctx, cacheKeys.textToImage, DEFAULT_TTL_MS, async () => {
    let body: string;
    try {
      body = await fetchAaRsc(ctx, upstreamEndpoints.aaTextToImage);
    } catch (err) {
      throw wrapUpstream("Text-to-image fetch failed", err);
    }
    if (!body) {
      throw new UpstreamError("Text-to-image returned an empty body");
    }
    let rawModels: Record<string, unknown>[];
    try {
      rawModels = parseRscPayload<Record<string, unknown>>(
        body,
        "textToImage",
        (tree) => findLongestData(tree, "textToImage") ?? findNextData(tree, "textToImage"),
      );
    } catch (err) {
      throw wrapUpstream("Text-to-image parse failed", err);
    }
    if (!Array.isArray(rawModels) || rawModels.length === 0) {
      throw zeroUpstream("Text-to-image", "raw rows", `raw=0, kept=0, body=${body.length}B`);
    }
    if (rawModels.length > 5000) {
      ctx.log("warn", `[text-to-image] oversized payload (${rawModels.length}), truncating`);
      rawModels = rawModels.slice(0, 5000);
    }
    const mapped = rawModels
      .map((m) => mapEntry(m))
      .filter((m): m is Omit<TextToImageModel, "rank"> => m !== null);
    const ranked = dedupeBy([...mapped].sort(byNumberDesc((m) => m.elo)), (m) => m.slug);
    const models: TextToImageModel[] = ranked.map((m, i) => ({ ...m, rank: i + 1 }));
    if (models.length === 0) {
      throw zeroUpstream("Text-to-image", "models", `raw=${rawModels.length}, kept=0`);
    }
    return { value: sourcePayload(models) };
  });
