import type { SourcePayload as SharedPayload } from "@/shared/types/payload";

export type SourcePayload<T> = SharedPayload<T>;

/**
 * Naming rule: `fetch*` never touches cache; `get*` always caches through the
 * shared pipeline helpers (`cachedSource` / `cachedPayload` in
 * `src/server/sources/pipeline.ts`).
 */
export function nowIso(): string {
  return new Date().toISOString();
}
