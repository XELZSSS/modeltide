import type { AppContext } from "@/server/context";
import { rssConfig, upstreamConfig } from "@/shared/config";
import type { ProbeResult } from "@/server/infra/http-client";
import { runCapped } from "@/server/infra/pool";
import { INDEX_PATH } from "@/server/sources/aa/fetch";
import { TEXT_TO_IMAGE_PATH } from "@/server/sources/aa/text-to-image";
import { RANKINGS_PATH } from "@/server/sources/openrouter/directory";
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
      url: `${upstreamConfig.artificialAnalysis}${INDEX_PATH}`,
    },
    { id: "openrouter", url: `${upstreamConfig.openrouter}/api/v1/models` },
    { id: "openrouter", url: `${upstreamConfig.openrouter}${RANKINGS_PATH}` },
    {
      id: "artificialAnalysis",
      url: `${upstreamConfig.artificialAnalysis}${TEXT_TO_IMAGE_PATH}`,
    },
    { id: "huggingface", url: `${upstreamConfig.huggingface}?limit=1` },
    { id: "arena", url: `${upstreamConfig.arena}/leaderboard/text` },
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
