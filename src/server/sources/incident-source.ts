import type { AppContext } from "@/server/context";
import { PROVIDER_CONCURRENCY, UPSTREAM_FETCH_OPTS, providerStatusEndpoints } from "@/server/config";
import { errMsg, runCapped } from "@/server/infra/task-pool";
import { parseGoogleCloudIncidents, parseStatuspageSummary } from "@/server/parsers/incident-parser";
import { parseOk, type ParseResult } from "@/server/parsers/parse-result";
import type { SourceId, SourceLevel } from "@/shared/types";

interface ProviderStatusResult {
  ok: boolean;
  warn: boolean;
  warnReason: string | null;
  status: number | null;
  latencyMs: number;
  error: string | null;
}

type HealthParse = (raw: unknown) => ParseResult<{ level: SourceLevel; detail: string }>;

/** Bounds one provider message; statuspage component/incident names are upstream-controlled. */
const DETAIL_MAX_CHARS = 200;

const parseStatuspageHealth: HealthParse = (raw) => {
  const parsed = parseStatuspageSummary(raw);
  if (!parsed.ok) return parsed;
  const { level, pageDescription, activeIncidents, degradedComponents } = parsed.data;
  const names = activeIncidents.length > 0 ? activeIncidents : degradedComponents;
  const head = pageDescription || (level === "error" ? "Outage" : "Degraded");
  const detail = names.length > 0 ? `${head}: ${names.slice(0, 3).join("; ")}` : head;
  return parseOk({ level, detail: detail.slice(0, DETAIL_MAX_CHARS) });
};

const parseGoogleCloudHealth: HealthParse = (raw) => {
  const parsed = parseGoogleCloudIncidents(raw);
  if (!parsed.ok) return parsed;
  const { level, openIncidents } = parsed.data;
  return parseOk({
    level,
    detail: `open incidents: ${openIncidents.slice(0, 3).join("; ")}`.slice(0, DETAIL_MAX_CHARS),
  });
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
    ctx.log("warn", `[provider-status] ${label} fetch failed: ${errMsg(err)}`);
    return null;
  }
  const latencyMs = Date.now() - started;
  const parsed = parse(raw);
  if (!parsed.ok) {
    ctx.log("warn", `[provider-status] ${label} parse failed: ${parsed.error}`);
    return null;
  }
  const { level, detail } = parsed.data;
  return {
    ok: level !== "error",
    warn: level === "warn",
    warnReason: level === "warn" ? detail : null,
    status: 200,
    latencyMs,
    error: level === "error" ? detail : null,
  };
}

const PROVIDER_STATUS_TARGETS: readonly {
  id: SourceId;
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

export const PROVIDER_STATUS_TARGET_COUNT = PROVIDER_STATUS_TARGETS.length;

export async function fetchProviderStatuses(ctx: AppContext): Promise<Map<SourceId, ProviderStatusResult>> {
  const settled = await runCapped(
    PROVIDER_STATUS_TARGETS.map((target) => async (): Promise<readonly [SourceId, ProviderStatusResult] | null> => {
      try {
        const result = await fetchProviderHealth(ctx, target.url, target.label, target.parse);
        return result ? ([target.id, result] as const) : null;
      } catch {
        ctx.log("warn", `[provider-status] ${target.label} sampling threw, skipping round`);
        return null;
      }
    }),
    PROVIDER_CONCURRENCY,
  );
  return new Map(settled.flatMap((s) => (s.status === "fulfilled" && s.value ? [s.value] : [])));
}
