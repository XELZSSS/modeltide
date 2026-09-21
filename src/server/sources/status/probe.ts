import type { AppContext } from "@/server/context";
import { PROBE_CONCURRENCY, rssConfig, upstreamConfig, upstreamEndpoints } from "@/server/config";
import type { ProbeResult } from "@/server/infra/http-client";
import { runCapped } from "@/server/infra/task-pool";
import type { SourceId } from "@/shared/types";

export interface ProbeTarget {
  id: SourceId;
  url: string;
}

export function buildTargets(): ProbeTarget[] {
  const newsTargets = (Object.keys(rssConfig) as (keyof typeof rssConfig)[]).flatMap((category) =>
    rssConfig[category].map((url): ProbeTarget => ({ id: "news", url })),
  );
  return [
    {
      id: "artificialAnalysis",
      url: `${upstreamConfig.artificialAnalysis}${upstreamEndpoints.aaIndex}`,
    },
    { id: "openrouter", url: `${upstreamConfig.openrouter}${upstreamEndpoints.openRouterDirectory}` },
    { id: "openrouter", url: `${upstreamConfig.openrouter}${upstreamEndpoints.openRouterRankings}` },
    {
      id: "artificialAnalysis",
      url: `${upstreamConfig.artificialAnalysis}${upstreamEndpoints.aaTextToImage}`,
    },
    { id: "huggingface", url: `${upstreamConfig.huggingface}?limit=1` },
    { id: "arena", url: `${upstreamConfig.arena}${upstreamEndpoints.agentBoard}` },
    ...newsTargets,
    {
      id: "news",
      url: `${upstreamConfig.huggingfaceSite}${upstreamEndpoints.hfDailyPapers}`,
    },
  ];
}

export async function probeTargets(ctx: AppContext): Promise<{ target: ProbeTarget; probe: ProbeResult }[]> {
  const probed = await runCapped(
    buildTargets().map((target) => async () => ({ target, probe: await ctx.http.probe(target.url) })),
    PROBE_CONCURRENCY,
  );
  return probed.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}

export interface SourceAggregate {
  ok: boolean;
  warn?: boolean;
  status: number | null;
  latencyMs: number | null;
  error: string | null;
}

export function aggregateProbes(probed: { target: ProbeTarget; probe: ProbeResult }[]): Map<SourceId, SourceAggregate> {
  type Mutable = SourceAggregate & { total: number; failures: number; firstError: string | null };
  const grouped = new Map<SourceId, Mutable>();

  // status == null (timeout/DNS/abort) is "unknown, not down": skipped, prior state kept.
  for (const { target, probe } of probed) {
    if (!probe.ok && probe.status == null) continue;
    let g = grouped.get(target.id);
    if (!g) {
      g = { ok: false, status: null, latencyMs: null, error: null, total: 0, failures: 0, firstError: null };
      grouped.set(target.id, g);
    }
    g.total += 1;
    if (probe.ok) {
      g.ok = true;
      g.status ??= probe.status;
      if (probe.latencyMs != null && (g.latencyMs == null || probe.latencyMs < g.latencyMs)) {
        g.latencyMs = probe.latencyMs;
      }
    } else {
      g.failures += 1;
      g.firstError ??= probe.error;
    }
  }

  const aggregated = new Map<SourceId, SourceAggregate>();
  for (const [id, g] of grouped) {
    // Partial loss stays visible; one healthy feed used to hide the failure count.
    const degraded = g.failures > 0;
    aggregated.set(id as SourceId, {
      ok: g.ok,
      ...(degraded && g.ok ? { warn: true } : {}),
      status: g.status,
      latencyMs: g.latencyMs,
      error: degraded ? (g.ok || g.total > 1 ? `${g.failures}/${g.total} feeds failed` : g.firstError) : null,
    });
  }
  return aggregated;
}
