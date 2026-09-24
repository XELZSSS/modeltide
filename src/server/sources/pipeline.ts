import type { AppContext } from "@/server/context";
import type { SourcePayload } from "@/shared/types";
import type { ParseResult } from "@/server/parsers/parse-result";
import { UpstreamError, zeroUpstream } from "@/server/infra/errors";
import { ttlFor } from "@/shared/config";

export function requireParsed<T>(result: ParseResult<T>): T {
  if (result.ok) return result.data;
  throw new UpstreamError(result.error);
}

export function requireRows<T>(rows: T[], label: string, unit: string, detail?: string): T[] {
  if (rows.length === 0) throw zeroUpstream(label, unit, detail);
  return rows;
}

interface CacheScope {
  memoryOnly?: boolean;
  staleCapMs?: number;
}

interface PayloadBuild<T> {
  rows: T;
  partial?: boolean;
  ttl?: number;
}

function sourcePayload<T>(rows: T, opts?: { partial?: boolean }): SourcePayload<T> {
  return { data: rows, fetchedAt: new Date().toISOString(), ...(opts?.partial ? { partial: true } : {}) };
}

export function cached<T>(
  ctx: AppContext,
  key: string,
  ttl: number,
  build: (ctx: AppContext) => Promise<{ data: T; ttl?: number }>,
  scope?: CacheScope,
): Promise<T> {
  const refreshCtx = ctx.refreshContext ?? ctx;
  return ctx.cache.withTtl<T>(key, ttl, () => build(refreshCtx), scope);
}

export function cachedRaw<T>(
  ctx: AppContext,
  key: string,
  ttl: number,
  fetch: (ctx: AppContext) => Promise<T>,
  scope?: CacheScope,
): Promise<T> {
  return cached<T>(ctx, key, ttl, async (refreshCtx) => ({ data: await fetch(refreshCtx) }), scope);
}

export function cachedPayload<T>(
  ctx: AppContext,
  key: string,
  ttl: number,
  build: (ctx: AppContext) => Promise<PayloadBuild<T>>,
  scope?: CacheScope,
): Promise<SourcePayload<T>> {
  return cached<SourcePayload<T>>(
    ctx,
    key,
    ttl,
    async (refreshCtx) => {
      const result = await build(refreshCtx);
      return {
        data: sourcePayload(result.rows, { partial: result.partial }),
        ttl: result.ttl ?? ttlFor(Boolean(result.partial), ttl),
      };
    },
    scope,
  );
}
