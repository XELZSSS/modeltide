import { numCoerce, isRecord, byNumberDesc, isUnsuitableContent } from "@/server/parsers/parser-primitives";
import { toStringOrNull } from "@/shared/utils";
import { SOURCE_LIMITS } from "@/server/config/limits";
import type { AgentRankEntry } from "@/shared/types";
import { zeroUpstreamMessage } from "@/server/infra/errors";

import { parseRscPayloads, traverse } from "@/server/parsers/rsc-parser";

import type { AgentSignalEntry } from "@/server/parsers/upstream-types";
import { parseFail, parseOk, type ParseResult } from "@/server/parsers/parse-result";

const AGENT_SIGNALS = [
  "task_outcome_explicit",
  "praise_complaint",
  "steering_burden",
  "bash_recovery_steps",
  "tool_hallucination",
] as const;

const MIN_AGENT_BOARDS = 3;

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
  const id = toStringOrNull(e.contenderName);
  const name = toStringOrNull(e.model);
  if (id == null || name == null) return null;
  if (isUnsuitableContent(id) || isUnsuitableContent(name)) return null;
  const score = numCoerce(e.score);
  if (score == null) return null;
  return {
    id,
    name,
    creator: toStringOrNull(e.modelOrganization) ?? "Unknown",
    score,
    ciLower: numCoerce(e.ciLower),
    ciUpper: numCoerce(e.ciUpper),
    license: toStringOrNull(e.license),
  };
}

const SIGNAL_NAMES: ReadonlySet<string> = new Set(AGENT_SIGNALS);

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

interface AgentOverall {
  rows: AgentRankEntry[];
  dropped: number;
}

function buildAgentOverall(available: { signal: string; rows: AgentSignalRow[] }[]): AgentOverall {
  const required = available.length;
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
  for (const board of available) {
    const seenOnBoard = new Set<string>();
    for (const row of board.rows) {
      if (seenOnBoard.has(row.id)) continue;
      seenOnBoard.add(row.id);
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
  const complete = [...acc.entries()].filter(([, v]) => v.scores.length === required);
  const ranked = complete.map(([id, v]) => ({
    id,
    name: v.name,
    creator: v.creator,
    license: v.license,
    score: mean(v.scores),
    ciLower: mean(v.ciLower),
    ciUpper: mean(v.ciUpper),
  }));
  ranked.sort(byNumberDesc((r) => r.score));
  return {
    rows: ranked.map((r, i) => ({ rank: i + 1, ...r })).slice(0, SOURCE_LIMITS.agentRankings),
    dropped: acc.size - complete.length,
  };
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
  const warnings: string[] = [];
  const boards = AGENT_SIGNALS.map((signal, i) => ({
    signal,
    rows: (perSignal[i] ?? []).map(toAgentSignalRow).filter((r): r is AgentSignalRow => r !== null),
  })).filter((board) => {
    if (board.rows.length > 0) return true;
    warnings.push(`Agent signal board "${board.signal}" yielded no usable rows`);
    return false;
  });
  if (boards.length < MIN_AGENT_BOARDS) {
    return parseFail(
      zeroUpstreamMessage(
        "Agent board",
        `at least ${MIN_AGENT_BOARDS} usable signal boards`,
        `usable=${boards.length}, markup changed?`,
      ),
    );
  }
  const overall = buildAgentOverall(boards);
  if (overall.rows.length === 0) {
    return parseFail(
      zeroUpstreamMessage(
        "Agent board",
        `rows from the ${boards.length}-signal composite`,
        `${overall.dropped} contenders dropped for missing a signal board`,
      ),
    );
  }
  return parseOk(overall.rows, warnings);
}
