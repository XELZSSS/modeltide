import { byNumberDesc } from "@/server/parsers/parser-primitives";
import type { AppContext } from "@/server/context";
import { DEFAULT_TTL_MS } from "@/shared/config";
import { cacheKeys, upstreamEndpoints } from "@/server/config";
import type { TextToImageModel } from "@/shared/types";
import type { SourcePayload } from "@/shared/types";
import { dedupeBy } from "@/shared/utils";

import { mapEntry, parseTextToImageRows } from "@/server/parsers/aa/text-to-image-parser";
import { fetchAaRsc } from "@/server/sources/aa/aa-fetch";
import { cachedPayload, requireParsed, requireRows } from "@/server/sources/pipeline";

export const getTextToImageLeaderboard = (ctx: AppContext): Promise<SourcePayload<TextToImageModel[]>> =>
  cachedPayload<TextToImageModel[]>(ctx, cacheKeys.textToImage, DEFAULT_TTL_MS, async (ctx) => {
    const body = await fetchAaRsc(ctx, upstreamEndpoints.aaTextToImage);
    let rawModels = requireRows(
      requireParsed(parseTextToImageRows(body)),
      "Text-to-image",
      "raw rows",
      `raw=0, kept=0, body=${body.length}B`,
    );
    if (rawModels.length > 5000) {
      ctx.log("warn", `[text-to-image] oversized payload (${rawModels.length}), truncating`);
      rawModels = rawModels.slice(0, 5000);
    }
    const mapped = rawModels.map((m) => mapEntry(m)).filter((m): m is Omit<TextToImageModel, "rank"> => m !== null);
    const ranked = dedupeBy(mapped.sort(byNumberDesc((m) => m.elo)), (m) => m.slug);
    const models: TextToImageModel[] = ranked.map((m, i) => ({ ...m, rank: i + 1 }));
    return { rows: requireRows(models, "Text-to-image", "models", `raw=${rawModels.length}, kept=0`) };
  });
