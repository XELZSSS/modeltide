import type { AppContext } from "@/server/context";
import { PROBE_CONCURRENCY, upstreamConfig, upstreamEndpoints, upstreamUrl } from "@/server/config";
import { rssFeeds } from "@/server/sources/news-feeds";
import type { ProbeResult } from "@/server/infra/http-client";
import { runCapped } from "@/server/infra/task-pool";
import type { SourceId } from "@/shared/types";
import { sourceAggregate, type SourceAggregate } from "./aggregate";

interface ProbeTarget {
  id: SourceId;
  url: string;
}

const CLIENT_ERROR_MIN = 400;
const SERVER_ERROR_MIN = 500;

function buildTargets(): ProbeTarget[] {
  const newsTargets = (Object.keys(rssFeeds) as (keyof typeof rssFeeds)[]).flatMap((category) =>
    rssFeeds[category].map((feed) => ({ id: feed.id, url: feed.url })),
  );
  // Multiple URLs per SourceId are aggregated: ok if any probe succeeds,
  // degraded if any fails. AA enrich (/models, /omniscience) and OpenRouter
  // directory can fail independently of their leaderboard/rankings pages,
  // so each leg gets its own liveness signal.
  return [
    {
      id: "artificialAnalysis",
      url: upstreamUrl(upstreamConfig.artificialAnalysis, upstreamEndpoints.aaLeaderboard),
    },
    {
      id: "artificialAnalysis",
      url: upstreamUrl(upstreamConfig.artificialAnalysis, upstreamEndpoints.aaModels),
    },
    {
      id: "artificialAnalysis",
      url: upstreamUrl(upstreamConfig.artificialAnalysis, upstreamEndpoints.aaOmniscience),
    },
    {
      id: "artificialAnalysis",
      url: upstreamUrl(upstreamConfig.artificialAnalysis, upstreamEndpoints.aaTextToImage),
    },
    { id: "openrouter", url: upstreamUrl(upstreamConfig.openrouter, upstreamEndpoints.openRouterRankings) },
    { id: "openrouter", url: upstreamUrl(upstreamConfig.openrouter, upstreamEndpoints.openRouterDirectory) },
    { id: "huggingface", url: `${upstreamConfig.huggingface}?limit=1` },
    { id: "arena", url: upstreamUrl(upstreamConfig.arena, upstreamEndpoints.agentBoard) },
    ...newsTargets,
  ];
}

export async function probeTargets(ctx: AppContext): Promise<{ target: ProbeTarget; probe: ProbeResult }[]> {
  const settled = await runCapped(
    buildTargets().map((target) => async () => ({ target, probe: await ctx.http.probe(target.url) })),
    PROBE_CONCURRENCY,
  );
  const results = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const measured = results.filter((r) => r.probe.error !== "aborted");
  const skipped = results.length - measured.length;
  if (skipped > 0) {
    ctx.log("warn", `[status-history] ${skipped}/${results.length} probes aborted locally before reaching an upstream`);
  }
  return measured;
}

interface MutableAggregate {
  ok: boolean;
  status: number | null;
  latencySum: number;
  latencyCount: number;
  total: number;
  failures: number;
  rejected: number;
  firstError: string | null;
}

function insertProbe(grouped: Map<SourceId, MutableAggregate>, target: ProbeTarget, probe: ProbeResult): void {
  let g = grouped.get(target.id);
  if (!g) {
    g = {
      ok: false,
      status: null,
      latencySum: 0,
      latencyCount: 0,
      total: 0,
      failures: 0,
      rejected: 0,
      firstError: null,
    };
    grouped.set(target.id, g);
  }
  g.total += 1;
  if (probe.ok) {
    g.ok = true;
    g.status ??= probe.status;
    if (probe.latencyMs != null) {
      g.latencySum += probe.latencyMs;
      g.latencyCount += 1;
    }
    return;
  }
  const status = probe.status;
  if (status != null && status >= CLIENT_ERROR_MIN && status < SERVER_ERROR_MIN) g.rejected += 1;
  else g.failures += 1;
  g.firstError ??= probe.error ?? "probe failed";
}

function summarizeGroup(g: MutableAggregate): SourceAggregate {
  const degraded = g.failures > 0 || g.rejected > 0;
  const head =
    g.failures > 0
      ? `${g.failures}/${g.total} endpoints failed`
      : `${g.rejected}/${g.total} endpoints rejected the probe`;
  return sourceAggregate({
    ok: g.ok,
    degraded,
    status: g.status,
    latencyMs: g.latencyCount > 0 ? Math.round(g.latencySum / g.latencyCount) : null,
    detail: degraded ? `${head}${g.firstError ? `: ${g.firstError}` : ""}` : null,
  });
}

export function aggregateProbes(probed: { target: ProbeTarget; probe: ProbeResult }[]): Map<SourceId, SourceAggregate> {
  const grouped = new Map<SourceId, MutableAggregate>();
  for (const { target, probe } of probed) insertProbe(grouped, target, probe);
  const aggregated = new Map<SourceId, SourceAggregate>();
  for (const [id, g] of grouped) aggregated.set(id, summarizeGroup(g));
  return aggregated;
}
