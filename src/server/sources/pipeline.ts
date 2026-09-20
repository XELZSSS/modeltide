import type { AppContext } from "@/server/context";
import type { SourcePayload } from "@/shared/types/payload";
import type { ParseResult } from "@/server/parsers/result";
import { UpstreamError } from "@/server/infra/errors";
import { ttlFor } from "@/shared/config";
import { nowIso } from "@/server/sources/types";

export function requireParsed<T>(result: ParseResult<T>): T {
  if (result.ok) return result.data;
  throw new UpstreamError(result.error);
}

export interface CacheScope {
  memoryOnly?: boolean;
}

export interface PayloadBuild<T> {
  rows: T;
  partial?: boolean;
  ttl?: number;
}

export function sourcePayload<T>(rows: T, opts?: { partial?: boolean }): SourcePayload<T> {
  return { data: rows, fetchedAt: nowIso(), ...(opts?.partial ? { partial: true } : {}) };
}

export function cached<T>(
  ctx: AppContext,
  key: string,
  ttl: number,
  build: (ctx: AppContext) => Promise<{ data: T; ttl?: number }>,
  scope?: CacheScope,
): Promise<T> {
  return ctx.cache.withTtl<T>(key, ttl, () => build(ctx), scope);
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
    async () => {
      const result = await build(ctx);
      return {
        data: sourcePayload(result.rows, { partial: result.partial }),
        ttl: result.ttl ?? ttlFor(Boolean(result.partial), ttl),
      };
    },
    scope,
  );
}

export interface SourceBuild<Value> {
  value: Value;
  ttl?: number;
}

export function cachedSource<Value>(
  ctx: AppContext,
  key: string,
  ttl: number,
  build: (ctx: AppContext) => Promise<SourceBuild<Value>>,
  scope?: CacheScope,
): Promise<Value> {
  return cached<Value>(
    ctx,
    key,
    ttl,
    async () => {
      const result = await build(ctx);
      return { data: result.value, ttl: result.ttl ?? ttl };
    },
    scope,
  );
}
