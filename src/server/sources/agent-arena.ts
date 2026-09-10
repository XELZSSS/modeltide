import { SLOW_TTL_MS } from "@/shared/config";
import { MAX_JSON_BYTES, UPSTREAM_FETCH_OPTS, cacheKeys, upstreamConfig, upstreamEndpoints } from "@/server/config";
import type { AgentRankEntry, AgentRankingsPayload } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { zeroUpstream } from "@/server/infra/errors";
import { fetchRscText } from "@/server/sources/rsc-fetch";
import { parseAgentBoards } from "@/server/parsers/agent-board";

const AGENT_PATH = upstreamEndpoints.agentBoard;

async function fetchAgentBoard(ctx: AppContext): Promise<AgentRankEntry[]> {
  const body = await fetchRscText(ctx, upstreamConfig.arena, AGENT_PATH, {
    headers: { RSC: "1", accept: "*/*" },
    // Board payloads are ~1.8MB and growing; keep the full JSON ceiling
    // instead of the 2MB feed ceiling so growth doesn't cliff into 502s.
    maxBytes: MAX_JSON_BYTES,
    retries: UPSTREAM_FETCH_OPTS.retries,
  });
  const entries = parseAgentBoards(body);
  if (entries.length === 0) {
    throw zeroUpstream("Agent board", "rows from the flight payload", `body=${body.length}B, markup changed?`);
  }
  return entries;
}

export const getAgentRankings = (ctx: AppContext): Promise<AgentRankingsPayload> =>
  ctx.cache.withTtl(cacheKeys.agentRankings, SLOW_TTL_MS, async () => {
    const entries = await fetchAgentBoard(ctx);
    return { data: { entries, fetchedAt: new Date().toISOString() } };
  });
