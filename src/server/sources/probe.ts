import { upstreamConfig, rssConfig } from "@/shared/config";
import type { SourceStatus } from "@/shared/types";
import type { AppContext } from "@/server/context";
import type { ProbeResult } from "@/server/infra/http";

export interface ProbeTarget {
  id: SourceStatus["id"];
  url: string;
}

export function buildTargets(): ProbeTarget[] {
  const newsFeeds = [
    ...new Set(
      Object.values(rssConfig)
        .flatMap((v) => v)
        .filter((v): v is string => !!v),
    ),
  ];
  return [
    {
      id: "artificialAnalysis",
      url: `${upstreamConfig.artificialAnalysis}/evaluations/artificial-analysis-intelligence-index`,
    },
    { id: "huggingface", url: `${upstreamConfig.huggingface}?limit=1` },
    { id: "openrouter", url: `${upstreamConfig.openrouter}/api/v1/models` },
    ...newsFeeds.map((url): ProbeTarget => ({ id: "news", url })),
  ];
}

/** One probe round over every target; results always fulfil (probe failures come back as ok:false). */
export async function probeTargets(ctx: AppContext): Promise<{ target: ProbeTarget; probe: ProbeResult }[]> {
  return Promise.all(buildTargets().map(async (target) => ({ target, probe: await ctx.http.probe(target.url) })));
}

/** Aggregated health for one source across all of its probe targets. */
export interface SourceAggregate {
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  /** Human-readable failure reason; null when healthy. */
  error: string | null;
}

/**
 * Fold a probe round into one aggregate per source: a source is healthy when any
 * of its probes succeeds (the last successful probe donates status and latency),
 * otherwise the error summarizes how many feeds failed.
 */
export function aggregateProbes(probed: { target: ProbeTarget; probe: ProbeResult }[]): Map<SourceStatus["id"], SourceAggregate> {
  type Mutable = SourceAggregate & { total: number; failures: number; firstError: string | null };
  const grouped = new Map<SourceStatus["id"], Mutable>();

  for (const { target, probe } of probed) {
    let g = grouped.get(target.id);
    if (!g) {
      g = { ok: false, status: null, latencyMs: null, error: null, total: 0, failures: 0, firstError: null };
      grouped.set(target.id, g);
    }
    g.total += 1;
    if (probe.ok) {
      g.ok = true;
      g.status = probe.status;
      g.latencyMs = probe.latencyMs;
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
