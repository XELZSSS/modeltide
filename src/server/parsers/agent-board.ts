import { SOURCE_LIMITS } from "@/shared/config";
import type { AgentRankEntry } from "@/shared/types";
import { zeroUpstream } from "@/server/infra/errors";
import { num, isRecord, strOrNull } from "@/server/parsers/primitives";
import { parseRscPayload, traverse } from "@/server/parsers/rsc";
import { byNumberDesc } from "@/server/parsers/shaping";
import { isUnsuitableContent } from "@/server/parsers/data-filter";

/**
 * The five scored signals embedded in the agent board payload. The page
 * renders no standalone overall array: the overall board is the equally
 * weighted mean of these signals (verified 1:1 against the official
 * lmarena-ai/leaderboard-dataset `agent` overall ranking).
 */
export const AGENT_SIGNALS = [
  "task_outcome_explicit",
  "praise_complaint",
  "steerability",
  "bash_recovery_steps",
  "tool_hallucination",
] as const;

export interface AgentSignalRow {
  id: string;
  name: string;
  creator: string;
  score: number;
  ciLower: number | null;
  ciUpper: number | null;
  license: string | null;
}

function toAgentSignalRow(e: unknown): AgentSignalRow | null {
  if (!isRecord(e)) return null;
  const id = strOrNull(e.contenderName);
  const name = strOrNull(e.model);
  if (id == null || name == null) return null;
  if (isUnsuitableContent(id) || isUnsuitableContent(name)) return null;
  const score = num(e.score);
  if (score == null) return null;
  return {
    id,
    name,
    creator: strOrNull(e.modelOrganization) ?? "Unknown",
    score,
    ciLower: num(e.ciLower),
    ciUpper: num(e.ciUpper),
    license: strOrNull(e.license),
  };
}

function extractSignalEntries(signal: string) {
  return (tree: unknown): Record<string, unknown>[] | null => {
    for (const node of traverse(tree)) {
      if (!isRecord(node) || node.name !== signal) continue;
      const entries = node.entries;
      if (Array.isArray(entries) && entries.length > 0) return entries as Record<string, unknown>[];
    }
    return null;
  };
}

export function buildAgentOverall(boards: { signal: string; rows: AgentSignalRow[] }[]): AgentRankEntry[] {
  const acc = new Map<
    string,
    {
      name: string;
      creator: string;
      license: string | null;
      scores: number[];
      ciLower: number[];
      ciUpper: number[];
    }
  >();
  const mean = (xs: number[]): number | null => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  for (const board of boards) {
    for (const row of board.rows) {
      let cur = acc.get(row.id);
      if (!cur) {
        cur = { name: row.name, creator: row.creator, license: row.license, scores: [], ciLower: [], ciUpper: [] };
        acc.set(row.id, cur);
      }
      cur.scores.push(row.score);
      if (row.ciLower != null) cur.ciLower.push(row.ciLower);
      if (row.ciUpper != null) cur.ciUpper.push(row.ciUpper);
    }
  }
  const ranked = [...acc.entries()].map(([id, v]) => ({
    id,
    name: v.name,
    creator: v.creator,
    license: v.license,
    score: mean(v.scores),
    ciLower: mean(v.ciLower),
    ciUpper: mean(v.ciUpper),
  }));
  ranked.sort(byNumberDesc((r) => r.score));
  // ids come from the acc Map keys, so they are already unique.
  return ranked.map((r, i) => ({ rank: i + 1, ...r })).slice(0, SOURCE_LIMITS.agentRankings);
}

export function parseAgentBoards(body: string): AgentRankEntry[] {
  const boards = AGENT_SIGNALS.map((signal) => {
    const raw = parseRscPayload<Record<string, unknown>>(body, signal, extractSignalEntries(signal));
    const rows = raw.map(toAgentSignalRow).filter((r): r is AgentSignalRow => r !== null);
    if (rows.length === 0) {
      throw zeroUpstream(`Agent board "${signal}"`, "usable rows", "markup changed?");
    }
    return { signal, rows };
  });
  return buildAgentOverall(boards);
}
