export const ONE_MINUTE = 60_000;
export const ONE_HOUR = 60 * ONE_MINUTE;
export const ONE_DAY = 24 * ONE_HOUR;
export const FIVE_MINUTES = 5 * ONE_MINUTE;
export const FIFTEEN_MINUTES = 15 * ONE_MINUTE;
export const THIRTY_MINUTES = 30 * ONE_MINUTE;
export const DEFAULT_TTL_MS = THIRTY_MINUTES;
export const NEWS_TTL_MS = ONE_HOUR;
export const SLOW_TTL_MS = 2 * ONE_HOUR;
export const STATIC_TTL_MS = 6 * ONE_HOUR;
export const PARTIAL_FAIL_TTL_MS = 15 * ONE_MINUTE;

export function ttlFor(partial: boolean, normalTtl: number = DEFAULT_TTL_MS): number {
  if (!partial) return normalTtl;
  return Math.min(normalTtl, Math.max(PARTIAL_FAIL_TTL_MS, Math.floor(normalTtl / 6)));
}

/** The upstream's own UTC day, which is the unit `expiresAt` is written in. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * An entry the upstream has retired: `expiresAt` is the first day the row is gone, so it is served through the day before
 * it. The source drops these while parsing; the ranking drops them again from a copy cached before the date passed,
 * because the array order is the ranking and a retired row would push every row below it down a place. The detail view
 * keeps them: a retired row is still the model a reader followed a link to, so its last snapshot is shown with a notice
 * instead of a dead page.
 */
export function isRetiredRankEntry(expiresAt: string | null, today: string = todayIso()): boolean {
  return expiresAt != null && expiresAt <= today;
}

/** The rows a ranking may show: an entry past its serving window no longer holds a rank. */
export function servedRankEntries<T extends { expiresAt: string | null }>(
  entries: T[],
  today: string = todayIso(),
): T[] {
  return entries.filter((entry) => !isRetiredRankEntry(entry.expiresAt, today));
}
