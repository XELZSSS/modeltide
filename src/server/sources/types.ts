import type { SourcePayload as SharedPayload } from "@/shared/types/payload";

export type SourcePayload<T> = SharedPayload<T>;

/**
 * Naming rule: `fetch*` never touches cache, `get*` always does (via ctx.cache.withTtl).
 */
export function nowIso(): string {
  return new Date().toISOString();
}
