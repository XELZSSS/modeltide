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
  // One representative per news category: the cron's news warmup already fetches
  // every feed in the same fire, so probing all of them is a duplicated request
  // that only sways the failure counters.
  const newsTargets = (Object.keys(rssConfig) as (keyof typeof rssConfig)[]).flatMap((category) => {
    const feed = rssConfig[category][0];
    return feed ? [{ id: "news" as const, url: feed }] : [];
  });
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
  /** Set alongside `warn`: which of the source's endpoints failed, and how. */
  warnReason?: string | null;
}

type MutableAggregate = SourceAggregate & { total: number; failures: number; failureNotes: string[] };

const MAX_FAILURE_NOTES = 3;

/** Upstream errors are bare ("HTTP 503", "timeout"), so name the endpoint they came from. */
function failureNote(target: ProbeTarget, error: string | null): string {
  return `${error ?? "probe failed"} (${new URL(target.url).host})`;
}

/**
 * What actually failed, for the event/sample detail: a single-endpoint source
 * reports its error outright, a multi-endpoint one (news feeds, the two
 * OpenRouter/AA endpoints) reports the failure count plus up to three concrete
 * endpoint errors.
 */
function failureDetail(g: MutableAggregate): string {
  if (g.total === 1 && g.failureNotes.length > 0) return g.failureNotes[0]!;
  const shown = g.failureNotes.slice(0, MAX_FAILURE_NOTES).join("; ");
  const suffix = g.failureNotes.length > MAX_FAILURE_NOTES ? "; …" : "";
  return shown ? `${g.failures}/${g.total} endpoints failed: ${shown}${suffix}` : `${g.failures}/${g.total} endpoints failed`;
}

function insertProbe(grouped: Map<SourceId, MutableAggregate>, target: ProbeTarget, probe: ProbeResult): void {
  // status == null (timeout/DNS/abort) is "unknown, not down": skipped, prior state kept.
  if (!probe.ok && probe.status == null) return;
  let g = grouped.get(target.id);
  if (!g) {
    g = { ok: false, status: null, latencyMs: null, error: null, total: 0, failures: 0, failureNotes: [] };
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
    const note = failureNote(target, probe.error);
    if (!g.failureNotes.includes(note)) g.failureNotes.push(note);
  }
}

function summarizeGroup(g: MutableAggregate): SourceAggregate {
  // Partial loss stays visible; one healthy feed used to hide the failure count.
  const degraded = g.failures > 0;
  const detail = degraded ? failureDetail(g) : null;
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
