import type { AppContext } from "./api/context";
import type { SourcePayload } from "@/shared/types";
import type { ParseResult } from "./formats/parse-result";
import { UpstreamError, zeroUpstream } from "./api/errors";
import type { Logger } from "./api/logger";
import { ttlFor } from "@/shared/config";
import type { CacheResult } from "./cache/service";

export function requireParsed<T>(result: ParseResult<T>, log?: Logger, label = "parser"): T {
  if (!result.ok) throw new UpstreamError(result.error);
  if (result.warnings.length > 0) log?.("warn", `[${label}] ${result.warnings.join("; ")}`);
  return result.data;
}

export function requireRows<T>(rows: T[], label: string, unit: string, detail?: string): T[] {
  if (rows.length === 0) throw zeroUpstream(label, unit, detail);
  return rows;
}

export function requireArrayBody(url: string, body: unknown, label: string): unknown[] {
  if (!Array.isArray(body)) throw zeroUpstream(label, "rows", `non-array body from ${url}`);
  if (body.length === 0) throw zeroUpstream(label, "rows", `empty body from ${url}`);
  return body;
}

export function toPartial<T extends { partial: boolean }>(value: T, degraded: boolean): T {
  return degraded ? { ...value, partial: true } : value;
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

function sourcePayload<T>(rows: T, partial: boolean): SourcePayload<T> {
  return { data: rows, fetchedAt: new Date().toISOString(), partial };
}

function refreshContextOf(ctx: AppContext): AppContext {
  return ctx.refreshContext ?? ctx;
}

export function cachedRaw<T>(
  ctx: AppContext,
  key: string,
  ttl: number,
  fetch: (ctx: AppContext) => Promise<T>,
  scope?: CacheScope,
): Promise<CacheResult<T>> {
  const refreshCtx = refreshContextOf(ctx);
  return ctx.cache.withTtlResult<T>(key, ttl, async () => ({ data: await fetch(refreshCtx) }), scope);
}

export function cachedPayload<T>(
  ctx: AppContext,
  key: string,
  ttl: number,
  build: (ctx: AppContext) => Promise<PayloadBuild<T>>,
  scope?: CacheScope,
): Promise<SourcePayload<T>> {
  const refreshCtx = refreshContextOf(ctx);
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

export interface SourceSpec<TRaw, TRow> {
  key: string;
  ttl: number;
  scope?: CacheScope;
  label: string;
  fetch: (ctx: AppContext) => Promise<TRaw>;
  // Implementations may declare fewer params than the signature passes (ctx is optional).
  parse: (raw: TRaw, ctx: AppContext) => TRow[];
  partialWhen?: (stats: { raw: TRaw }) => { partial: boolean; ttl?: number; log?: Record<string, unknown> };
  cap?: number;
}

export function defineSource<TRaw, TRow>(
  spec: SourceSpec<TRaw, TRow>,
): (ctx: AppContext) => Promise<SourcePayload<TRow[]>> {
  return (ctx: AppContext) =>
    cachedPayload<TRow[]>(
      ctx,
      spec.key,
      spec.ttl,
      async (refreshCtx) => {
        const raw = await spec.fetch(refreshCtx);
        let rows = spec.parse(raw, refreshCtx);
        let truncated = false;
        if (spec.cap != null && rows.length > spec.cap) {
          truncated = true;
          refreshCtx.log("warn", `[${spec.label}] oversized payload (${rows.length}), truncating to ${spec.cap}`);
          rows = rows.slice(0, spec.cap);
        }
        requireRows(rows, spec.label, "rows");
        const verdict = spec.partialWhen?.({ raw });
        if (verdict?.log) refreshCtx.log("warn", `[${spec.label}] partial`, verdict.log);
        return { rows, partial: truncated || verdict?.partial === true, ttl: verdict?.ttl };
      },
      spec.scope,
    );
}
