import { numCoerce, isRecord, strOrNull, byNumberDesc, isUnsuitableContent } from "@/server/parsers/parser-primitives";
import { SOURCE_LIMITS } from "@/server/config/limits";
import type { AgentRankEntry } from "@/shared/types";
import { zeroUpstreamMessage } from "@/server/infra/errors";

import { parseRscPayloads, traverse } from "@/server/parsers/rsc-parser";

import type { AgentSignalEntry } from "@/server/parsers/upstream-types";
import { parseFail, parseOk, type ParseResult } from "@/server/parsers/parse-result";

const AGENT_SIGNALS = [
  "task_outcome_explicit",
  "praise_complaint",
  "steerability",
  "bash_recovery_steps",
  "tool_hallucination",
] as const;

interface AgentSignalRow {
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
  const score = numCoerce(e.score);
  if (score == null) return null;
  return {
    id,
    name,
    creator: strOrNull(e.modelOrganization) ?? "Unknown",
    score,
    ciLower: numCoerce(e.ciLower),
    ciUpper: numCoerce(e.ciUpper),
    license: strOrNull(e.license),
  };
}

const SIGNAL_NAMES: ReadonlySet<string> = new Set(AGENT_SIGNALS);

/** All five boards in one walk; keyed by the tree so the memo dies with the parse that built it. */
const BOARDS_BY_TREE = new WeakMap<object, Map<string, AgentSignalEntry[]>>();

function scanSignalBoards(tree: unknown): Map<string, AgentSignalEntry[]> {
  const boards = new Map<string, AgentSignalEntry[]>();
  for (const node of traverse(tree)) {
    if (!isRecord(node)) continue;
    const signal = node.name;
    if (typeof signal !== "string" || boards.has(signal) || !SIGNAL_NAMES.has(signal)) continue;
    const entries = node.entries;
    if (Array.isArray(entries) && entries.length > 0) boards.set(signal, entries as AgentSignalEntry[]);
  }
  return boards;
}

function extractSignalEntries(tree: unknown, signal: string): AgentSignalEntry[] | null {
  if (typeof signal !== "string" || !signal || tree === null || typeof tree !== "object") return null;
  let boards = BOARDS_BY_TREE.get(tree);
  if (!boards) {
    boards = scanSignalBoards(tree);
    BOARDS_BY_TREE.set(tree, boards);
  }
  return boards.get(signal) ?? null;
}

function buildAgentOverall(boards: { signal: string; rows: AgentSignalRow[] }[]): AgentRankEntry[] {
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

export function parseAgentBoards(body: unknown): ParseResult<AgentRankEntry[]> {
  if (typeof body !== "string" || !body) {
    return parseFail("Agent board returned an empty body");
  }
  const scanned = parseRscPayloads<AgentSignalEntry>(body, AGENT_SIGNALS, extractSignalEntries);
  if (!scanned.ok) {
    return parseFail(`Agent board could not be extracted: ${scanned.error}`);
  }
  const perSignal = scanned.data;
  const boards = AGENT_SIGNALS.map((signal, i) => ({
    signal,
    rows: (perSignal[i] ?? []).map(toAgentSignalRow).filter((r): r is AgentSignalRow => r !== null),
  }));
  // An empty board is structural drift, not a document that carried no rows.
  const empty = boards.find((b) => b.rows.length === 0);
  if (empty) {
    return parseFail(zeroUpstreamMessage(`Agent board "${empty.signal}"`, "usable rows", "markup changed?"));
  }
  return parseOk(buildAgentOverall(boards));
}
