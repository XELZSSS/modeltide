export interface SourcePayload<T> {
  data: T;
  fetchedAt: string;
  partial: boolean;
}

export function isPartialPayload(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { partial?: unknown; data?: unknown; fetchedAt?: unknown };
  return v.partial === true && "data" in v && "fetchedAt" in v;
}
