import type { TextToImageModel } from "@/shared/types";
import { num, numNonNegative, toStringOrNull, isFiniteNumber } from "@/server/parsers/primitives";

const intOrNull = (v: unknown): number | null => (isFiniteNumber(v) ? Math.trunc(v) : null);

interface RawElo {
  elo?: unknown;
  ciDelta?: unknown;
  appearances?: unknown;
  wins?: unknown;
  winRate?: unknown;
  tag?: unknown;
}

export interface RawEntry {
  id?: unknown;
  slug?: unknown;
  name?: unknown;
  pricePer1kImages?: unknown;
  overallElo?: unknown;
  overallRank?: unknown;
  elos?: unknown;
  creator?: unknown;
}

export function mapEntry(raw: RawEntry): TextToImageModel | null {
  const id = toStringOrNull(raw.id);
  const slug = toStringOrNull(raw.slug);
  const name = toStringOrNull(raw.name);
  if (!id || !slug || !name) return null;

  const rank = isFiniteNumber(raw.overallRank) && raw.overallRank > 0 ? Math.trunc(raw.overallRank) : null;
  if (rank == null) return null;

  const elos = Array.isArray(raw.elos) ? (raw.elos as RawElo[]) : [];
  const overallEloEntry =
    elos.find((e) => e != null && typeof e === "object" && (e as Record<string, unknown>).tag == null) ??
    elos.find((e) => e != null && typeof e === "object") ??
    null;

  let elo: number | null = null;
  let ciDelta: number | null = null;
  let appearances: number | null = null;
  let winRate: number | null = null;

  if (overallEloEntry) {
    elo = num(overallEloEntry.elo);
    ciDelta = num(overallEloEntry.ciDelta);
    appearances = intOrNull(overallEloEntry.appearances);
    winRate = num(overallEloEntry.winRate);
  }

  if (elo == null && isFiniteNumber(raw.overallElo)) elo = raw.overallElo as number;
  if (elo == null) return null;

  const pricePer1kImages = numNonNegative(raw.pricePer1kImages);
  const creator = raw.creator as Record<string, unknown> | null | undefined;

  return {
    id,
    slug,
    name: name.trim(),
    rank,
    elo,
    eloLower: ciDelta != null ? elo - ciDelta : null,
    eloUpper: ciDelta != null ? elo + ciDelta : null,
    appearances,
    winRate,
    pricePer1kImages,
    creatorName: creator ? toStringOrNull(creator.name) : null,
  };
}
