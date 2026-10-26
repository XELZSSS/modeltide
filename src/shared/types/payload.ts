/**
 * The envelope every route answers with: the rows, and whether they could be fully refreshed. The moment they were
 * produced is deliberately not part of it — it names the ETag on the server side (`src/server/served-payload.ts`), and
 * no client ever read the field.
 */
export interface SourcePayload<T> {
  data: T;
  partial: boolean;
}

export function isPartialPayload(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { partial?: unknown; data?: unknown };
  return v.partial === true && "data" in v;
}
