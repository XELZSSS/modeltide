import { newsWarmDue } from "@/shared/config";
import type { RouteDef } from "./types";

function withQuery(url: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * Expand each route into concrete warmup URLs: enum-valued params are enumerated
 * for warm routes, remaining params fall back to their schema defaults.
 * "window" routes are only due within their TTL-aligned warming window, so the
 * frequent cron skips them otherwise instead of rewriting fresh cache entries.
 */
export function buildWarmUrls(base: string, routes: readonly RouteDef[], now: Date = new Date()): string[] {
  const includeWarmWindow = newsWarmDue(now.getUTCMinutes());
  return (
    routes
      // noStore routes (live probe results, self-healing history) gain nothing
      // from CDN warming — and warming status-history would trigger a duplicate
      // 7-target probe round on top of the scheduled sampler. Skip them.
      .filter((route) => route.noStore !== true)
      .filter((route) => route.warm !== "window" || includeWarmWindow)
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
        }
        return combos.map((combo) => withQuery(base + route.path, { ...defaults, ...combo }));
      })
  );
}
