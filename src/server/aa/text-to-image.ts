import { byNumberDesc } from "@/server/formats/parser-primitives";
import type { AppContext } from "@/server/api/context";
import { DEFAULT_TTL_MS } from "@/shared/config";
import { cacheKeys } from "@/server/cache/keys";
import { upstreamConfig, upstreamEndpoints } from "@/server/upstream/upstream";
import { MAX_LEADERBOARD_ROWS } from "@/server/formats/limits";
import type { TextToImageModel } from "@/shared/types";
import { dedupeBy } from "@/shared/utils";

import { parseTextToImageRows } from "./parse/text-to-image";
import { defineSource, requireParsed, requireRows } from "@/server/pipeline";

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
