import { num, isRecord, strOrNull, byNumberDesc, isUnsuitableContent } from "@/server/parsers/primitives";
import { SOURCE_LIMITS } from "@/shared/config";
import type { AgentRankEntry } from "@/shared/types";
import { zeroUpstreamMessage } from "@/server/infra/errors";

import { parseRscPayload, traverse } from "@/server/parsers/rsc";

import type { AgentSignalEntry } from "@/server/parsers/upstream";
import { parseFail, parseOk, type ParseResult } from "@/server/parsers/result";

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

function toAgentSignalRow(e: AgentSignalEntry): AgentSignalRow | null {
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
  return (tree: unknown): AgentSignalEntry[] | null => {
    for (const node of traverse(tree)) {
      if (!isRecord(node) || node.name !== signal) continue;
      const entries = node.entries;
      if (Array.isArray(entries) && entries.length > 0) return entries as AgentSignalEntry[];
    }
    return null;
  };
}

export function buildAgentOverall(boards: { signal: string; rows: AgentSignalRow[] }[]): AgentRankEntry[] {
  const required = boards.length;
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
  const ranked = [...acc.entries()]
    .filter(([, v]) => v.scores.length === required)
    .map(([id, v]) => ({
      id,
      name: v.name,
      creator: v.creator,
      license: v.license,
      score: mean(v.scores),
      ciLower: mean(v.ciLower),
      ciUpper: mean(v.ciUpper),
    }));
  ranked.sort(byNumberDesc((r) => r.score));
  return ranked.map((r, i) => ({ rank: i + 1, ...r })).slice(0, SOURCE_LIMITS.agentRankings);
}

export function parseAgentBoards(body: string): ParseResult<AgentRankEntry[]> {
  const boards: { signal: string; rows: AgentSignalRow[] }[] = [];
  for (const signal of AGENT_SIGNALS) {
    let raw: AgentSignalEntry[];
    try {
      raw = parseRscPayload<AgentSignalEntry>(body, signal, extractSignalEntries(signal));
    } catch (err) {
      return parseFail(
        `Agent board "${signal}" could not be extracted: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const rows = raw.map(toAgentSignalRow).filter((r): r is AgentSignalRow => r !== null);
    if (rows.length === 0) {
      return parseFail(zeroUpstreamMessage(`Agent board "${signal}"`, "usable rows", "markup changed?"));
    }
    boards.push({ signal, rows });
  }
  return parseOk(buildAgentOverall(boards));
}
