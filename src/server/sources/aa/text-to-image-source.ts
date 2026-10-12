import { byNumberDesc } from "@/server/parsers/parser-primitives";
import type { AppContext } from "@/server/context";
import { DEFAULT_TTL_MS } from "@/shared/config";
import { cacheKeys, upstreamConfig, upstreamEndpoints } from "@/server/config";
import { MAX_LEADERBOARD_ROWS } from "@/server/config/limits";
import type { TextToImageModel } from "@/shared/types";
import { dedupeBy } from "@/shared/utils";

import { parseTextToImageRows } from "@/server/parsers/aa/text-to-image-parser";
import { defineSource, requireParsed, requireRows } from "@/server/sources/pipeline";

export const getTextToImageLeaderboard = defineSource<string, TextToImageModel>({
  key: cacheKeys.textToImage,
  ttl: DEFAULT_TTL_MS,
  label: "Text-to-image",
  fetch: (ctx: AppContext) => ctx.http.getRsc(upstreamConfig.artificialAnalysis, upstreamEndpoints.aaTextToImage),
  parse: (body, ctx) => {
    const mapped = requireRows(
      requireParsed(parseTextToImageRows(body), ctx.log, "text-to-image"),
      "Text-to-image",
      "rows",
      `raw=0, kept=0, body=${body.length}B`,
    );
    const ranked = dedupeBy(mapped.sort(byNumberDesc((m) => m.elo)), (m) => m.slug);
    return ranked.map((m, i) => ({ ...m, rank: i + 1 }));
  },
  cap: MAX_LEADERBOARD_ROWS,
});
