import type { AppContext } from "@/server/context";
import { UPSTREAM_FETCH_OPTS, providerStatusEndpoints } from "@/server/config";
import { errMsg, runCapped } from "@/server/infra/pool";
import { parseGoogleCloudIncidents, parseStatuspageSummary } from "@/server/parsers/provider-status";

export interface ProviderStatusResult {
  ok: boolean;
  status: number | null;
  latencyMs: number;
  error: string | null;
}

/** Adapter turning a provider-specific parser into a uniform health verdict. */
type HealthParse = (raw: unknown) => { ok: boolean; error: string };

const parseStatuspageHealth: HealthParse = (raw) => {
  const parsed = parseStatuspageSummary(raw);
  return { ok: parsed.ok, error: `degraded: ${parsed.degradedComponents.slice(0, 3).join(", ")}` };
};

const parseGoogleCloudHealth: HealthParse = (raw) => {
  const parsed = parseGoogleCloudIncidents(raw);
  return { ok: parsed.ok, error: `open incidents: ${parsed.openIncidents.slice(0, 3).join("; ")}` };
};

async function fetchProviderHealth(
  ctx: AppContext,
  url: string,
  label: string,
  parse: HealthParse,
): Promise<ProviderStatusResult | null> {
  const started = Date.now();
  let raw: unknown;
  try {
    raw = await ctx.http.json<unknown>(url, UPSTREAM_FETCH_OPTS);
  } catch (err) {
    // Our fetch failing says nothing about the provider — status pages are
    // independently hosted. Report unknown (skip this round) so our own network
    // blip can't flip the source down and manufacture a down/up event pair.
    ctx.log("warn", `[provider-status] ${label} fetch failed: ${errMsg(err)}`);
    return null;
  }
  const latencyMs = Date.now() - started;
  try {
    const parsed = parse(raw);
    if (parsed.ok) return { ok: true, status: 200, latencyMs, error: null };
    return { ok: false, status: 200, latencyMs, error: parsed.error };
  } catch (err) {
    // Got a payload we can't parse: our parser is outdated, not proof the
    // provider is down. Same unknown handling as a fetch failure.
    ctx.log("warn", `[provider-status] ${label} parse failed: ${errMsg(err)}`);
    return null;
  }
}

const PROVIDER_STATUS_TARGETS: readonly {
  id: ProviderStatusId;
  url: string;
  label: string;
  parse: HealthParse;
}[] = [
  { id: "openaiApi", url: providerStatusEndpoints.openaiApi, label: "openai", parse: parseStatuspageHealth },
  { id: "anthropicApi", url: providerStatusEndpoints.anthropicApi, label: "anthropic", parse: parseStatuspageHealth },
  {
    id: "googleCloudApi",
    url: providerStatusEndpoints.googleCloudApi,
    label: "google-cloud",
    parse: parseGoogleCloudHealth,
  },
  { id: "groqApi", url: providerStatusEndpoints.groqApi, label: "groq", parse: parseStatuspageHealth },
  { id: "cohereApi", url: providerStatusEndpoints.cohereApi, label: "cohere", parse: parseStatuspageHealth },
  { id: "fireworksApi", url: providerStatusEndpoints.fireworksApi, label: "fireworks", parse: parseStatuspageHealth },
  { id: "cerebrasApi", url: providerStatusEndpoints.cerebrasApi, label: "cerebras", parse: parseStatuspageHealth },
  { id: "deepseekApi", url: providerStatusEndpoints.deepseekApi, label: "deepseek", parse: parseStatuspageHealth },
  { id: "moonshotApi", url: providerStatusEndpoints.moonshotApi, label: "moonshot", parse: parseStatuspageHealth },
];

export type ProviderStatusId =
  | "openaiApi"
  | "anthropicApi"
  | "googleCloudApi"
  | "groqApi"
  | "cohereApi"
  | "fireworksApi"
  | "cerebrasApi"
  | "deepseekApi"
  | "moonshotApi";

export async function fetchProviderStatuses(ctx: AppContext): Promise<Map<ProviderStatusId, ProviderStatusResult>> {
  const settled = await runCapped(
    PROVIDER_STATUS_TARGETS.map(
      (target) => () =>
        fetchProviderHealth(ctx, target.url, target.label, target.parse).then((result) => [target.id, result] as const),
    ),
    3,
  );
  const results: (readonly [ProviderStatusId, ProviderStatusResult])[] = [];
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i]!;
    const target = PROVIDER_STATUS_TARGETS[i]!;
    if (s.status === "fulfilled") {
      const [id, result] = s.value;
      // Unknown (our fetch/parse failed) is skipped, not recorded: the source keeps
      // its previous state instead of flapping down on this round and up on the next.
      if (result !== null) results.push([id, result] as const);
    } else {
      ctx.log("warn", `[provider-status] ${target.label} sampling threw, skipping round`);
    }
  }
  return new Map(results);
}
