import type { AppContext } from "./api/context";
import { ttlFor } from "@/shared/config";
import type { SourcePayload } from "@/shared/types";
import type { ParseResult } from "./formats/parse-result";
import { UpstreamError, zeroUpstream } from "./api/errors";
import type { Logger } from "./api/logger";
import type { CacheScope } from "./cache/types";
import { degraded, served, type ServedPayload } from "./served-payload";

// All four callers pass both a logger and a label, so `log` was never the no-logger path and `label` never the
// `"parser"` default: requiring them drops the dead optional-chain branch and the untaken default.
export function requireParsed<T>(result: ParseResult<T>, log: Logger, label: string): T {
  if (!result.ok) throw new UpstreamError(result.error);
  if (result.warnings.length > 0) log("warn", `[${label}] ${result.warnings.join("; ")}`);
  return result.data;
}

export function requireRows<T>(rows: T[], label: string, unit: string, detail?: string): T[] {
  if (rows.length === 0) throw zeroUpstream(label, unit, detail);
  return rows;
}

export function requireArrayBody<T = unknown>(url: string, body: unknown, label: string): T[] {
  if (!Array.isArray(body)) throw zeroUpstream(label, "rows", `non-array body from ${url}`);
  if (body.length === 0) throw zeroUpstream(label, "rows", `empty body from ${url}`);
  return body as T[];
}

interface PartialVerdict {
  partial: boolean;
  ttl?: number;
  log?: Record<string, unknown>;
}

interface SourceSpec<P, TRaw, TData> {
  ttl: number;
  scope?: CacheScope;
  label: string;
  /**
   * True when a route returns this payload to a client. Internal sources compose their value into another source and
   * never answer a request, so the cache skips the response copy they would never serve.
   */
  served?: boolean;
  fetch: (ctx: AppContext, params: P) => Promise<TRaw>;
  parse: (raw: TRaw, ctx: AppContext) => TData;
  /** Truncates an array payload to this many rows and flags the result partial. */
  cap?: number;
  partialWhen?: (stats: { raw: TRaw }) => PartialVerdict;
}

/**
 * A source with a fixed cache key. The envelope it answers is the one a route returns — `{ data, partial }` — so a
 * source never states a `partial` flag it did not compute.
 */
export type FixedSource<T> = (ctx: AppContext) => Promise<ServedPayload<T>>;

/** A source whose cache key and upstream request depend on the validated query. */
type ParamSource<P, T> = (ctx: AppContext, params: P) => Promise<ServedPayload<T>>;

export function defineParamSource<P, TRaw, TData>(
  keyOf: (params: P) => string,
  spec: SourceSpec<P, TRaw, TData>,
): ParamSource<P, TData> {
  return (ctx, params) => {
    const refreshCtx = ctx.refreshContext ?? ctx;
    return ctx.cache
      .withTtlResult<SourcePayload<TData>>(
        keyOf(params),
        spec.ttl,
        async () => {
          const raw = await spec.fetch(refreshCtx, params);
          let data = spec.parse(raw, refreshCtx);
          let truncated = false;
          if (spec.cap != null && Array.isArray(data) && data.length > spec.cap) {
            truncated = true;
            refreshCtx.log("warn", `[${spec.label}] oversized payload (${data.length}), truncating to ${spec.cap}`);
            data = data.slice(0, spec.cap) as TData;
          }
          const verdict = spec.partialWhen?.({ raw });
          if (verdict?.log) refreshCtx.log("warn", `[${spec.label}] partial`, verdict.log);
          const partial = truncated || verdict?.partial === true;
          return {
            data: { data, partial },
            ttl: verdict?.ttl ?? ttlFor(partial, spec.ttl),
          };
        },
        { ...spec.scope, serveBody: spec.served === true },
      )
      .then(({ value, degraded: isDegraded, body, producedAt }) =>
        // A stale fallback rewrites the stored copy into a partial response, so the body stored beside it still says
        // `partial: false`. Serving those bytes would ship a payload whose flag, ETag and cache headers disagree with
        // its own body, and the client would never show the partial notice or start polling. Only an unchanged payload
        // may be served from the copy the cache encoded.
        isDegraded ? degraded<TData>(value, producedAt) : served<TData>(value, { body, producedAt }),
      );
  };
}

export function defineSource<TRaw, TData>(spec: SourceSpec<void, TRaw, TData> & { key: string }): FixedSource<TData> {
  const run = defineParamSource<void, TRaw, TData>(() => spec.key, spec);
  return (ctx) => run(ctx, undefined);
}

interface PartialSourceSpec<TRaw extends { partial: boolean }, T> {
  key: string;
  ttl: number;
  label: string;
  served?: boolean;
  cap?: number;
  fetch: (ctx: AppContext) => Promise<TRaw>;
  pick: (raw: TRaw) => T;
  /**
   * Runs on the picked value before it is cached — the row check that would otherwise sit in a `parse` of its own.
   * It reports failure the way every other source does: by throwing.
   */
  refine?: (data: T, raw: TRaw) => void;
}

/**
 * A source whose `fetch` already knows whether its payload is partial. The wrapper derives `parse` and `partialWhen`
 * from the one shape, so the four sources that used to write `parse: (raw) => raw.data` next to
 * `partialWhen: ({ raw }) => ({ partial: raw.partial })` cannot report a flag their own fetch did not set.
 */
export function definePartialSource<TRaw extends { partial: boolean }, T>(
  spec: PartialSourceSpec<TRaw, T>,
): FixedSource<T> {
  return defineSource<TRaw, T>({
    key: spec.key,
    ttl: spec.ttl,
    label: spec.label,
    served: spec.served,
    cap: spec.cap,
    fetch: spec.fetch,
    parse: (raw) => {
      const data = spec.pick(raw);
      spec.refine?.(data, raw);
      return data;
    },
    partialWhen: ({ raw }) => ({ partial: raw.partial }),
  });
}
