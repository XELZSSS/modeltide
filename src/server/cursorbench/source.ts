import { STATIC_TTL_MS } from "@/shared/config";
import { cacheKeys } from "@/server/cache/keys";
import { MAX_CURSORBENCH_ROWS } from "@/server/formats/limits";
import { defineSource, requireParsed } from "@/server/pipeline";
import { upstreamConfig, upstreamEndpoints, upstreamUrl } from "@/server/upstream/upstream";
import type { CursorBenchEntry } from "@/shared/types";
import { parseCursorBench } from "./parse";

/**
 * CursorBench publishes no API: the ranking is server-rendered HTML, so this source is one page fetch plus a table scan. It
 * moves only when Cursor re-runs the benchmark, which is what `STATIC_TTL_MS` is for.
 */
export const getCursorBench = defineSource<string, CursorBenchEntry[]>({
  key: cacheKeys.cursorBench,
  ttl: STATIC_TTL_MS,
  label: "CursorBench",
  served: true,
  cap: MAX_CURSORBENCH_ROWS,
  fetch: (ctx) => ctx.http.text(upstreamUrl(upstreamConfig.cursor, upstreamEndpoints.cursorBench)),
  parse: (html, ctx) => requireParsed(parseCursorBench(html), ctx.log, "cursorbench"),
});
