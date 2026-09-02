import type { AppContext } from "@/server/context";
import { buildTargets, aggregateProbes, type ProbeTarget } from "@/server/sources/probe";
import type { SourceAggregate } from "@/server/sources/probe";

/** Domain service: executes probe round and aggregates — extracted from sources/probe for SRP. */
export class ProbeService {
  constructor(private ctx: AppContext) {}

  async probeAll(): Promise<Map<string, SourceAggregate>> {
    const targets: ProbeTarget[] = buildTargets();
    const results = await Promise.all(
      targets.map(async (target) => ({ target, probe: await this.ctx.http.probe(target.url) })),
    );
    return aggregateProbes(results) as Map<string, SourceAggregate>;
  }

  /** Direct passthrough for legacy callers. */
  static buildTargets = buildTargets;
  static aggregateProbes = aggregateProbes;
}
