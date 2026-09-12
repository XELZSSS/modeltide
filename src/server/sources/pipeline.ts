import type { AppContext } from "@/server/context";
import type { SourcePayload } from "@/shared/types/payload";
import type { ParseResult } from "@/server/parsers/result";
import { UpstreamError } from "@/server/infra/errors";
import { ttlFor } from "@/shared/config";
import { nowIso } from "@/server/sources/types";

/**
 * Raise a parser's failure reason as an UpstreamError. This is where the
 * parser→HTTP error policy lives: domain parsers return `ParseResult` and never
 * throw, sources call `requireParsed` to turn a failure into a 502 (or 504 via
 * the underlying error class).
 */
export function requireParsed<T>(result: ParseResult<T>): T {
  if (result.ok) return result.data;
  throw new UpstreamError(result.error);
}

/**
 * Result of a source's parse/build step. `rows` is whatever the source caches
 * (list, detail record, ...); `partial` flags a degraded fan-out; `ttl` is an
 * explicit cache-lifetime override (e.g. ratio-based for multi-leg sources).
 */
export interface PayloadBuild<T> {
  rows: T;
  partial?: boolean;
  ttl?: number;
}

/**
 * Build the shared `SourcePayload` wire envelope. Centralizes the
 * `{ data, fetchedAt, partial? }` shape and the timestamp source so no source
 * hand-rolls `new Date().toISOString()` vs `nowIso()` inconsistently.
 */
export function sourcePayload<T>(rows: T, opts?: { partial?: boolean }): SourcePayload<T> {
  return { data: rows, fetchedAt: nowIso(), ...(opts?.partial ? { partial: true } : {}) };
}

/**
 * Cache a list/detail source that serves the standard `SourcePayload<T>`
 * envelope. Applies the partial-failure TTL downgrade unless the build returns
 * its own `ttl` (ratio-based sources), so callers only express *what* changed,
 * not the cache policy boilerplate.
 */
export function cachedPayload<T>(
  ctx: AppContext,
  key: string,
  ttl: number,
  build: (ctx: AppContext) => Promise<PayloadBuild<T>>,
): Promise<SourcePayload<T>> {
  return ctx.cache.withTtl<SourcePayload<T>>(key, ttl, async () => {
    const result = await build(ctx);
    return {
      data: sourcePayload(result.rows, { partial: result.partial }),
      ttl: result.ttl ?? ttlFor(Boolean(result.partial), ttl),
    };
  });
}

/** Build result for a domain-payload source (no shared `SourcePayload` envelope). */
export interface SourceBuild<Value> {
  value: Value;
  /** Explicit TTL override; omitted falls back to the source's base TTL. */
  ttl?: number;
}

/**
 * Cache a source that serves its own domain payload shape (openrouter
 * rankings, agent board, text-to-image, official pricing, home dashboard,
 * status history). Keeps every source's cache access behind the same
 * `pipeline.ts` entry point while preserving each payload's wire contract.
 */
export function cachedSource<Value>(
  ctx: AppContext,
  key: string,
  ttl: number,
  build: (ctx: AppContext) => Promise<SourceBuild<Value>>,
): Promise<Value> {
  return ctx.cache.withTtl<Value>(key, ttl, async () => {
    const result = await build(ctx);
    return { data: result.value, ttl: result.ttl ?? ttl };
  });
}
