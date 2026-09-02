import { THIRTY_MINUTES } from "@/shared/config";
import type { RouteDef } from "@/server/routes/table";

function withQuery(url: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return qs ? `${url}?${qs}` : url;
}

export function buildWarmUrls(base: string, routes: readonly RouteDef[], _now: Date = new Date()): string[] {
  return routes
    .filter((route) => route.noStore !== true)
    .flatMap((route) => {
      const specs = route.query ?? {};
      const defaults: Record<string, string> = {};
      for (const [name, spec] of Object.entries(specs)) {
        if (spec.default !== undefined) defaults[name] = spec.default;
      }
      if (!route.warm) return [withQuery(base + route.path, defaults)];

      let combos: Record<string, string>[] = [{}];
      for (const [name, spec] of Object.entries(specs)) {
        if (spec.type !== "enum") continue;
        combos = combos.flatMap((combo) => spec.values.map((v) => ({ ...combo, [name]: v })));
        if (combos.length > 20) {
          combos = combos.slice(0, 20);
          break;
        }
      }
      return combos.map((combo) => withQuery(base + route.path, { ...defaults, ...combo }));
    });
}

export interface WarmBuckets {
  live: string[];
  bulk: string[];
}

export function bucketWarmUrls(base: string, routes: readonly RouteDef[], now: Date = new Date()): WarmBuckets {
  const isLive = (route: RouteDef): boolean => route.warmPriority === "live";
  return {
    live: buildWarmUrls(
      base,
      routes.filter((route) => isLive(route)),
      now,
    ),
    bulk: buildWarmUrls(
      base,
      routes.filter((route) => !isLive(route)),
      now,
    ),
  };
}

export const BULK_PER_TICK = 5;

export function bulkSliceForTick(bulk: string[], now: Date = new Date()): string[] {
  if (bulk.length === 0) return [];
  const time = now.getTime();
  if (!Number.isFinite(time)) return bulk.slice(0, BULK_PER_TICK);
  const tick = Math.floor(time / THIRTY_MINUTES);
  const chunks = Math.max(1, Math.ceil(bulk.length / BULK_PER_TICK));
  const start = (tick % chunks) * BULK_PER_TICK;
  return bulk.slice(start, start + BULK_PER_TICK);
}
