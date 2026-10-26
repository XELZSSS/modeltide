import { ONE_HOUR } from "@/shared/config";
import { cacheKeys } from "@/server/cache/keys";
import { MAX_LEADERBOARD_ROWS } from "@/server/formats/limits";
import { byNumberDesc } from "@/server/formats/ordering";
import { defineSource, requireParsed, requireRows } from "@/server/pipeline";
import { upstreamConfig, upstreamEndpoints } from "@/server/upstream/upstream";
import type { DecisionIndexEntry } from "@/shared/types";

import { parseDecisionRows } from "./parse/decision";

/**
 * Artificial Analysis' Decision Index: a composite scored over five columns drawn from four datasets — omniscience
 * contributes both its accuracy and its non-hallucination rate, while HLE multiple choice, when2call and wildguardtest
 * contribute one each — with language models and decision models ranked side by side. The page renders as a leaderboard
 * already ordered by the index, but the order is re-established here so the payload decides it, not the markup.
 */
export const getDecisionIndex = defineSource<string, DecisionIndexEntry[]>({
  key: cacheKeys.decisionIndex,
  ttl: ONE_HOUR,
  label: "Decision index",
  fetch: (ctx) => ctx.http.getRsc(upstreamConfig.artificialAnalysis, upstreamEndpoints.aaDecisionIndex),
  parse: (body, ctx) => {
    const rows = requireRows(
      requireParsed(parseDecisionRows(body), ctx.log, "decision-index"),
      "Decision index",
      "rows",
      `body=${body.length}B`,
    );
    return rows.sort(byNumberDesc((row) => row.index));
  },
  cap: MAX_LEADERBOARD_ROWS,
});
