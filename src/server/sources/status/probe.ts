import type { AppContext } from "@/server/context";
import { rssConfig, upstreamConfig, upstreamEndpoints } from "@/server/config";
import type { ProbeResult } from "@/server/infra/http-client";
import { runCapped } from "@/server/infra/pool";
import type { SourceStatus } from "@/shared/types";

export interface ProbeTarget {
  id: SourceStatus["id"];
  url: string;
}

export function buildTargets(): ProbeTarget[] {
  const newsSample = Object.values(rssConfig)
    .map((feeds) => feeds[0])
    .filter((v): v is string => !!v);
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
    ...newsSample.map((url): ProbeTarget => ({ id: "news", url })),
  ];
}

export async function probeTargets(ctx: AppContext): Promise<{ target: ProbeTarget; probe: ProbeResult }[]> {
  const PROBE_CONCURRENCY = 3;
  const probed = await runCapped(
    buildTargets().map((target) => async () => ({ target, probe: await ctx.http.probe(target.url) })),
    PROBE_CONCURRENCY,
  );
  return probed.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}

export interface SourceAggregate {
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  error: string | null;
}

export function aggregateProbes(
  probed: { target: ProbeTarget; probe: ProbeResult }[],
): Map<SourceStatus["id"], SourceAggregate> {
  type Mutable = SourceAggregate & { total: number; failures: number; firstError: string | null };
  const grouped = new Map<SourceStatus["id"], Mutable>();

  for (const { target, probe } of probed) {
    // Unreachable (timeout / DNS / reset: no HTTP status at all) means WE failed to
    // reach the target, not that the target is down — same unknown-skip rule as the
    // provider status pages. The probe is excluded from the verdict entirely, so our
    // own network blip can't flip the source. An id with no decisive probes at all is
    // omitted from the result and keeps its previous sample/state downstream.
    // Only a completed HTTP exchange with an error status counts as a failure.
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

  const aggregated = new Map<SourceStatus["id"], SourceAggregate>();
  for (const [id, g] of grouped) {
    aggregated.set(id, {
      ok: g.ok,
      status: g.status,
      latencyMs: g.latencyMs,
      error: g.ok ? null : g.total > 1 ? `${g.failures}/${g.total} feeds failed` : g.firstError,
    });
  }
  return aggregated;
}
