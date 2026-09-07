import type { Context } from "hono";
import { WARM_HOST } from "@/server/config";
import type { RouteDef } from "@/server/routes/table";

export function warmupHeaders(env: { WARM_TOKEN?: string }): Record<string, string> {
  return env.WARM_TOKEN ? { "x-warmup": env.WARM_TOKEN } : { "x-warmup": "1" };
}

export function isWarmupRequest(c: Context, env: { WARM_TOKEN?: string }): boolean {
  const got = c.req.header("x-warmup") ?? "";
  if (env.WARM_TOKEN) return got !== "" && got === env.WARM_TOKEN;
  return got === "1" && c.req.header("host") === WARM_HOST;
}

function withQuery(url: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return qs ? `${url}?${qs}` : url;
}

export function buildWarmUrls(base: string, routes: readonly RouteDef[]): string[] {
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
