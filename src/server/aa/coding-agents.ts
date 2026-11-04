import { byNumberDesc } from "@/server/formats/ordering";
import type { AppContext } from "@/server/api/context";
import { ONE_HOUR } from "@/shared/config";
import { cacheKeys } from "@/server/cache/keys";
import { upstreamConfig, upstreamEndpoints } from "@/server/upstream/upstream";
import { MAX_LEADERBOARD_ROWS } from "@/server/formats/limits";
import type { CodingAgentEntry } from "@/shared/types";
import { dedupeBy } from "@/shared/utils";

import { parseCodingAgentsRows } from "./parse/coding-agents";
import { defineSource, requireParsed, requireRows } from "@/server/pipeline";

/**
 * Artificial Analysis' Coding Agent Index: one composite score per agent, at the model that scored highest for it.
 *
 * The index is the equally weighted mean of three of AA's own agentic coding evaluations — FrontierCode v1.1,
 * SWE-Atlas-QnA and Terminal-Bench v4 — and the page re-runs whenever AA adds an agent pairing, so the hour matches the
 * index source beside it rather than the static windows a release list uses. AA publishes a row per agent × model
 * pairing, so an agent can hold several places; this source keeps its best pairing, which is what the card ranks.
 */
export const getCodingAgentRankings = defineSource<string, CodingAgentEntry[]>({
  key: cacheKeys.codingAgents,
  ttl: ONE_HOUR,
  label: "Coding agents",
  fetch: (ctx: AppContext) => ctx.http.getRsc(upstreamConfig.artificialAnalysis, upstreamEndpoints.aaCodingAgents),
  parse: (body, ctx) => {
    const parsed = parseCodingAgentsRows(body);
    // A zero-row failure reports the body it came from; the rows the parser rejected are already in its own warning.
    const mapped = requireRows(
      requireParsed(parsed, ctx.log, "coding-agents"),
      "Coding agents",
      "rows",
      `kept=0, body=${body.length}B`,
    );
    // AA publishes one row per agent × model pairing; the card ranks agents, so the first row of each agent after the
    // sort desc — its highest-scoring pairing — is the one that represents it.
    return dedupeBy(mapped.sort(byNumberDesc((entry) => entry.score)), (entry) => entry.agent);
  },
  cap: MAX_LEADERBOARD_ROWS,
});
