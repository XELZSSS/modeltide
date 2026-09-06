import type { AppContext } from "@/server/context";
import { STATIC_TTL_MS } from "@/shared/config";
import { FAST_FETCH_OPTS, cacheKeys } from "@/server/config";
import { obj, str } from "@/server/parsers/primitives";
import { UpstreamError, errMsg } from "@/server/infra/errors";
import { runCapped } from "@/server/infra/pool";

const HEALTHY_COMPONENT_STATES = new Set(["operational"]);

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
  return { ok: degradedComponents.length === 0, degradedComponents, total };
}

export interface ProviderStatusResult {
  ok: boolean;
  status: number | null;
  latencyMs: number;
  error: string | null;
}

async function fetchStatuspage(ctx: AppContext, url: string, label: string): Promise<ProviderStatusResult> {
  const started = Date.now();
  let raw: unknown;
  try {
    raw = await ctx.http.json<unknown>(url, FAST_FETCH_OPTS);
  } catch (err) {
    return { ok: false, status: null, latencyMs: Date.now() - started, error: errMsg(err) };
  }
  const latencyMs = Date.now() - started;
  try {
    const parsed = parseStatuspageSummary(raw);
    if (parsed.ok) return { ok: true, status: 200, latencyMs, error: null };
    return {
      ok: false,
      status: 200,
      latencyMs,
      error: `degraded: ${parsed.degradedComponents.slice(0, 3).join(", ")}`,
    };
  } catch (err) {
    ctx.log("warn", `[provider-status] ${label} parse failed: ${errMsg(err)}`);
    return { ok: false, status: 200, latencyMs, error: "unrecognized status payload" };
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

async function fetchGoogleCloudStatus(ctx: AppContext): Promise<ProviderStatusResult> {
  const started = Date.now();
  let raw: unknown;
  try {
    raw = await ctx.http.json<unknown>(GOOGLE_CLOUD_STATUS_URL, FAST_FETCH_OPTS);
  } catch (err) {
    return { ok: false, status: null, latencyMs: Date.now() - started, error: errMsg(err) };
  }
  const latencyMs = Date.now() - started;
  try {
    const parsed = parseGoogleCloudIncidents(raw);
    if (parsed.ok) return { ok: true, status: 200, latencyMs, error: null };
    return {
      ok: false,
      status: 200,
      latencyMs,
      error: `open incidents: ${parsed.openIncidents.slice(0, 3).join("; ")}`,
    };
  } catch (err) {
    ctx.log("warn", `[provider-status] google-cloud parse failed: ${errMsg(err)}`);
    return { ok: false, status: 200, latencyMs, error: "unrecognized status payload" };
  }
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

export const PROVIDER_STATUS_TARGETS: readonly { id: ProviderStatusId; url: string; label: string }[] = [
  { id: "openaiApi", url: OPENAI_STATUS_URL, label: "openai" },
  { id: "anthropicApi", url: CLAUDE_STATUS_URL, label: "anthropic" },
  { id: "googleCloudApi", url: GOOGLE_CLOUD_STATUS_URL, label: "google-cloud" },
  { id: "groqApi", url: GROQ_STATUS_URL, label: "groq" },
  { id: "cohereApi", url: COHERE_STATUS_URL, label: "cohere" },
  { id: "fireworksApi", url: FIREWORKS_STATUS_URL, label: "fireworks" },
  { id: "cerebrasApi", url: CEREBRAS_STATUS_URL, label: "cerebras" },
  { id: "deepseekApi", url: DEEPSEEK_STATUS_URL, label: "deepseek" },
  { id: "moonshotApi", url: MOONSHOT_STATUS_URL, label: "moonshot" },
];

export async function fetchProviderStatuses(ctx: AppContext): Promise<Map<ProviderStatusId, ProviderStatusResult>> {
  const settled = await runCapped(
    PROVIDER_STATUS_TARGETS.map(
      (target) => () =>
        target.id === "googleCloudApi"
          ? fetchGoogleCloudStatus(ctx).then((result) => [target.id, result] as const)
          : fetchStatuspage(ctx, target.url, target.label).then((result) => [target.id, result] as const),
    ),
    3,
  );
  const results: (readonly [ProviderStatusId, ProviderStatusResult])[] = [];
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i]!;
    const target = PROVIDER_STATUS_TARGETS[i]!;
    if (s.status === "fulfilled") results.push(s.value);
    else results.push([target.id, { ok: false, status: null, latencyMs: 0, error: "sampling failed" }] as const);
  }
  return new Map(results);
}

export const getProviderStatuses = (ctx: AppContext): Promise<Record<ProviderStatusId, ProviderStatusResult>> =>
  ctx.cache.withTtl(cacheKeys.providerStatus, STATIC_TTL_MS, async () => {
    const map = await fetchProviderStatuses(ctx);
    const record = {} as Record<ProviderStatusId, ProviderStatusResult>;
    let failures = 0;
    for (const target of PROVIDER_STATUS_TARGETS) {
      const result = map.get(target.id);
      if (!result) {
        record[target.id] = { ok: false, status: null, latencyMs: 0, error: "missing from sampling round" };
        failures += 1;
        continue;
      }
      record[target.id] = result;
      if (!result.ok) failures += 1;
    }
    if (failures === PROVIDER_STATUS_TARGETS.length) {
      throw new UpstreamError(`Provider status: all ${PROVIDER_STATUS_TARGETS.length} status pages failed`);
    }
    return { data: record };
  });
