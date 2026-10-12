import { SLOW_TTL_MS } from "@/shared/config";
import { cacheKeys, upstreamConfig, upstreamEndpoints } from "@/server/config";
import type { AgentRankEntry } from "@/shared/types";
import { parseAgentBoards } from "@/server/parsers/agent-arena-parser";
import { defineSource, requireParsed, requireRows } from "@/server/sources/pipeline";

export const getAgentRankings = defineSource<string, AgentRankEntry>({
  key: cacheKeys.agentRankings,
  ttl: SLOW_TTL_MS,
  label: "Agent board",
  fetch: (ctx) => ctx.http.getRsc(upstreamConfig.arena, upstreamEndpoints.agentBoard),
  parse: (body, ctx) => {
    const entries = requireParsed(parseAgentBoards(body), ctx.log, "agent-board");
    return requireRows(entries, "Agent board", "rows from the flight payload", `body=${body.length}B, markup changed?`);
  },
});
