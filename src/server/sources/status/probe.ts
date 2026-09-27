import type { AppContext } from "@/server/context";
import { PROBE_CONCURRENCY, upstreamConfig, upstreamEndpoints, upstreamUrl } from "@/server/config";
import { rssConfig } from "@/server/sources/news-feeds";
import type { ProbeResult } from "@/server/infra/http-client";
import { runCapped } from "@/server/infra/task-pool";
import type { SourceId } from "@/shared/types";

interface ProbeTarget {
  id: SourceId;
  url: string;
}

function buildTargets(): ProbeTarget[] {
  const newsTargets = (Object.keys(rssConfig) as (keyof typeof rssConfig)[]).flatMap((category) =>
    rssConfig[category].map((url) => ({ id: "news" as const, url })),
  );
  return [
    {
      id: "artificialAnalysis",
      url: upstreamUrl(upstreamConfig.artificialAnalysis, upstreamEndpoints.aaIndex),
    },
    { id: "openrouter", url: upstreamUrl(upstreamConfig.openrouter, upstreamEndpoints.openRouterDirectory) },
    { id: "openrouter", url: upstreamUrl(upstreamConfig.openrouter, upstreamEndpoints.openRouterRankings) },
    {
      id: "artificialAnalysis",
      url: upstreamUrl(upstreamConfig.artificialAnalysis, upstreamEndpoints.aaTextToImage),
    },
    { id: "huggingface", url: `${upstreamConfig.huggingface}?limit=1` },
    { id: "arena", url: upstreamUrl(upstreamConfig.arena, upstreamEndpoints.agentBoard) },
    ...newsTargets,
    {
      id: "news",
      url: upstreamUrl(upstreamConfig.huggingfaceSite, upstreamEndpoints.hfDailyPapers),
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
  warnReason?: string | null;
}

interface MutableAggregate extends Omit<SourceAggregate, "warn" | "warnReason" | "error"> {
  total: number;
  failures: number;
  unknown: number;
  firstError: string | null;
}

function insertProbe(grouped: Map<SourceId, MutableAggregate>, target: ProbeTarget, probe: ProbeResult): void {
  let g = grouped.get(target.id);
  if (!g) {
    g = { ok: false, status: null, latencyMs: null, total: 0, failures: 0, unknown: 0, firstError: null };
    grouped.set(target.id, g);
  }
  g.total += 1;
  if (probe.ok) {
    g.ok = true;
    g.status ??= probe.status;
    if (probe.latencyMs != null && (g.latencyMs == null || probe.latencyMs > g.latencyMs)) {
      g.latencyMs = probe.latencyMs;
    }
    return;
  }
  if (probe.status == null) g.unknown += 1;
  else g.failures += 1;
  g.firstError ??= probe.error ?? "probe failed";
}

function summarizeGroup(g: MutableAggregate): SourceAggregate {
  const degraded = g.failures > 0 || g.unknown > 0;
  const head =
    g.failures > 0 ? `${g.failures}/${g.total} endpoints failed` : `${g.unknown}/${g.total} endpoints unreachable`;
  const detail = degraded ? `${head}${g.firstError ? `: ${g.firstError}` : ""}` : null;
  return {
    ok: g.ok,
    ...(degraded && g.ok ? { warn: true, warnReason: detail } : {}),
    status: g.status,
    latencyMs: g.latencyMs,
    error: g.ok ? null : detail,
  };
}

export function aggregateProbes(probed: { target: ProbeTarget; probe: ProbeResult }[]): Map<SourceId, SourceAggregate> {
  const grouped = new Map<SourceId, MutableAggregate>();
  for (const { target, probe } of probed) insertProbe(grouped, target, probe);
  const aggregated = new Map<SourceId, SourceAggregate>();
  for (const [id, g] of grouped) aggregated.set(id, summarizeGroup(g));
  return aggregated;
}
