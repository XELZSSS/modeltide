import type { AppContext } from "@/server/context";
import type { QuerySchema, ValidatedQuery } from "@/server/infra/validate";

/** Declarative route descriptor: path, optional query schema (validated per request), cache policy, and the handler. */
export interface RouteDef<S extends QuerySchema = QuerySchema> {
  path: string;
  query?: S;
  /**
   * Cron warmup mode: "all" warms every enum-param combination on each tick;
   * "window" (long-TTL routes like news) warms only inside the TTL-aligned window.
   */
  warm?: "all" | "window";
  /** Skip browser/CDN caching for responses that must reflect live state (e.g. probe results). */
  noStore?: boolean;
  /**
   * Best-effort per-IP KV rate limit, applied only to clients presenting a
   * CF-Connecting-IP (Cloudflare always sets one in production). Keyed per path,
   * so two fields on different routes get independent budgets.
   */
  rateLimit?: { windowSec: number; max: number };
  handler(ctx: AppContext, params: ValidatedQuery<S>): Promise<unknown>;
}

/**
 * Give a single route definition its precise type: the query schema is inferred
 * from the literal so handler params are fully typed without casts.
 */
export function defineRoute<S extends QuerySchema>(def: RouteDef<S>): RouteDef<S> {
  return def;
}
