import type { AppContext } from "@/server/context";
import { UPSTREAM_FETCH_OPTS } from "@/server/config";
import { obj, str } from "@/server/parsers/primitives";
import { UpstreamError } from "@/server/infra/errors";
import { errMsg, runCapped } from "@/server/infra/pool";

const HEALTHY_COMPONENT_STATES = new Set(["operational"]);

// Page-level verdicts reported by Statuspage (`summary.json` → `status.indicator`).
// This is the provider's own communicated state ("All Systems Operational" vs an
// incident banner) and the only thing that may flip a source to down.
// Per-component states are kept as detail text for the error message, but a single
// degraded edge component must not flip the whole provider: that produced a
// down/up flap on nearly every sampling round.
const HEALTHY_PAGE_INDICATORS = new Set(["none"]);

export function parseStatuspageSummary(raw: unknown): { ok: boolean; degradedComponents: string[]; total: number } {
  const root = obj(raw);
  const componentsRaw = root?.components;
  if (!Array.isArray(componentsRaw) || componentsRaw.length === 0) {
    throw new UpstreamError("Statuspage summary has no components array");
  }
  const degradedComponents: string[] = [];
  let total = 0;
  for (const entry of componentsRaw as unknown[]) {
    const c = obj(entry);
    if (!c) continue;
    const status = str(c.status).trim().toLowerCase();
    if (!status) continue;
    total += 1;
    if (!HEALTHY_COMPONENT_STATES.has(status)) {
      const name = str(c.name).trim();
      degradedComponents.push(name || status);
    }
  }
  if (total === 0) {
    throw new UpstreamError("Statuspage summary has no readable component states");
  }
  // Prefer the page-level indicator when the payload carries one; fall back to the
  // component rule for non-standard shapes so unknown payloads fail closed, not open.
  const indicator = str(obj(root?.status)?.indicator).trim().toLowerCase();
  const ok = indicator ? HEALTHY_PAGE_INDICATORS.has(indicator) : degradedComponents.length === 0;
  return { ok, degradedComponents, total };
}

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

interface GcpIncident {
  external_desc?: unknown;
  end?: unknown;
  severity?: unknown;
}

const GCP_ROUTINE_SEVERITIES = new Set(["low"]);

export function parseGoogleCloudIncidents(raw: unknown): { ok: boolean; openIncidents: string[] } {
  if (!Array.isArray(raw)) {
    throw new UpstreamError("Google Cloud status returned a non-array payload");
  }
  const openIncidents: string[] = [];
  for (const entry of raw as GcpIncident[]) {
    const incident = obj(entry);
    if (!incident) continue;
    if (str(incident.end).trim()) continue;
    const severity = str(incident.severity).trim().toLowerCase();
    if (GCP_ROUTINE_SEVERITIES.has(severity)) continue;
    openIncidents.push(str(incident.external_desc).trim().slice(0, 120) || severity || "open incident");
  }
  return { ok: openIncidents.length === 0, openIncidents };
}

const OPENAI_STATUS_URL = "https://status.openai.com/api/v2/summary.json";
const CLAUDE_STATUS_URL = "https://status.claude.com/api/v2/summary.json";
const GOOGLE_CLOUD_STATUS_URL = "https://status.cloud.google.com/incidents.json";
const GROQ_STATUS_URL = "https://groqstatus.com/api/v2/summary.json";
const COHERE_STATUS_URL = "https://status.cohere.com/api/v2/summary.json";
const FIREWORKS_STATUS_URL = "https://status.fireworks.ai/api/v2/summary.json";
const CEREBRAS_STATUS_URL = "https://status.cerebras.ai/api/v2/summary.json";
const DEEPSEEK_STATUS_URL = "https://deepseek.statuspage.io/api/v2/summary.json";
const MOONSHOT_STATUS_URL = "https://status.moonshot.cn/api/v2/summary.json";

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

const PROVIDER_STATUS_TARGETS: readonly {
  id: ProviderStatusId;
  url: string;
  label: string;
  parse: HealthParse;
}[] = [
  { id: "openaiApi", url: OPENAI_STATUS_URL, label: "openai", parse: parseStatuspageHealth },
  { id: "anthropicApi", url: CLAUDE_STATUS_URL, label: "anthropic", parse: parseStatuspageHealth },
  { id: "googleCloudApi", url: GOOGLE_CLOUD_STATUS_URL, label: "google-cloud", parse: parseGoogleCloudHealth },
  { id: "groqApi", url: GROQ_STATUS_URL, label: "groq", parse: parseStatuspageHealth },
  { id: "cohereApi", url: COHERE_STATUS_URL, label: "cohere", parse: parseStatuspageHealth },
  { id: "fireworksApi", url: FIREWORKS_STATUS_URL, label: "fireworks", parse: parseStatuspageHealth },
  { id: "cerebrasApi", url: CEREBRAS_STATUS_URL, label: "cerebras", parse: parseStatuspageHealth },
  { id: "deepseekApi", url: DEEPSEEK_STATUS_URL, label: "deepseek", parse: parseStatuspageHealth },
  { id: "moonshotApi", url: MOONSHOT_STATUS_URL, label: "moonshot", parse: parseStatuspageHealth },
];

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
