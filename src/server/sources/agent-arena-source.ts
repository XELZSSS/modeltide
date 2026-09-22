import { SLOW_TTL_MS } from "@/shared/config";
import { MAX_JSON_BYTES, UPSTREAM_FETCH_OPTS, cacheKeys, upstreamConfig, upstreamEndpoints } from "@/server/config";
import type { AgentRankEntry, AgentRankingsPayload } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { fetchRscText } from "@/server/sources/rsc-fetcher";
import { parseAgentBoards } from "@/server/parsers/agent-arena-parser";
import { cached, requireParsed, requireRows } from "@/server/sources/pipeline";

const AGENT_PATH = upstreamEndpoints.agentBoard;

async function fetchAgentBoard(ctx: AppContext): Promise<AgentRankEntry[]> {
  const body = await fetchRscText(ctx, upstreamConfig.arena, AGENT_PATH, {
    headers: { RSC: "1", accept: "*/*" },
    // ~1.8MB boards: keep the JSON ceiling so growth doesn't cliff into 502s.
    maxBytes: MAX_JSON_BYTES,
    retries: UPSTREAM_FETCH_OPTS.retries,
  });
  const entries = requireParsed(parseAgentBoards(body));
  return requireRows(entries, "Agent board", "rows from the flight payload", `body=${body.length}B, markup changed?`);
}

export const getAgentRankings = (ctx: AppContext): Promise<AgentRankingsPayload> =>
  cached(ctx, cacheKeys.agentRankings, SLOW_TTL_MS, async () => {
    const entries = await fetchAgentBoard(ctx);
    return { data: { entries, fetchedAt: new Date().toISOString() } };
  });
