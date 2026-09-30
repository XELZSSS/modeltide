import type { AppContext } from "@/server/context";
import type { SourcePayload } from "@/shared/types";
import type { ParseResult } from "@/server/parsers/parse-result";
import { UpstreamError, zeroUpstream } from "@/server/infra/errors";
import type { Logger } from "@/server/infra/logger";
import { ttlFor } from "@/shared/config";

export function requireParsed<T>(result: ParseResult<T>, log?: Logger, label = "parser"): T {
  if (!result.ok) throw new UpstreamError(result.error);
  if (result.warnings.length > 0) log?.("warn", `[${label}] ${result.warnings.join("; ")}`);
  return result.data;
}

export function requireRows<T>(rows: T[], label: string, unit: string, detail?: string): T[] {
  if (rows.length === 0) throw zeroUpstream(label, unit, detail);
  return rows;
}

interface CacheScope {
  memoryOnly?: boolean;
  staleCapMs?: number;
}

export interface CachedValue<T> {
  value: T;
  degraded: boolean;
}

interface PayloadBuild<T> {
  rows: T;
  partial?: boolean;
  ttl?: number;
}

function sourcePayload<T>(rows: T, partial: boolean): SourcePayload<T> {
  return { data: rows, fetchedAt: new Date().toISOString(), partial };
}

export function cachedRaw<T>(
  ctx: AppContext,
  key: string,
  ttl: number,
  fetch: (ctx: AppContext) => Promise<T>,
  scope?: CacheScope,
): Promise<CachedValue<T>> {
  const refreshCtx = ctx.refreshContext ?? ctx;
  return ctx.cache.withTtlResult<T>(key, ttl, async () => ({ data: await fetch(refreshCtx) }), scope);
}

export function cachedPayload<T>(
  ctx: AppContext,
  key: string,
  ttl: number,
  build: (ctx: AppContext) => Promise<PayloadBuild<T>>,
  scope?: CacheScope,
): Promise<SourcePayload<T>> {
  const refreshCtx = ctx.refreshContext ?? ctx;
  return ctx.cache
    .withTtlResult<SourcePayload<T>>(
      key,
      ttl,
      async () => {
        const result = await build(refreshCtx);
        const partial = result.partial === true;
        return {
          data: sourcePayload(result.rows, partial),
          ttl: result.ttl ?? ttlFor(partial, ttl),
        };
      },
      scope,
    )
    .then(({ value, degraded }) => (degraded ? { ...value, partial: true } : value));
}
