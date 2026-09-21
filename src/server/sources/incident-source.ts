import type { AppContext } from "@/server/context";
import { UPSTREAM_FETCH_OPTS, providerStatusEndpoints } from "@/server/config";
import { errMsg, runCapped } from "@/server/infra/task-pool";
import { PROVIDER_CONCURRENCY } from "@/server/config";
import { parseGoogleCloudIncidents, parseStatuspageSummary } from "@/server/parsers/incident-parser";
import { parseOk, type ParseResult } from "@/server/parsers/parse-result";
import type { SourceLevel } from "@/shared/types";

interface ProviderStatusResult {
  ok: boolean;
  warn: boolean;
  status: number | null;
  latencyMs: number;
  error: string | null;
}

type HealthParse = (raw: unknown) => ParseResult<{ level: SourceLevel; error: string }>;

const parseStatuspageHealth: HealthParse = (raw) => {
  const parsed = parseStatuspageSummary(raw);
  if (!parsed.ok) return parsed;
  return parseOk({
    level: parsed.data.level,
    error: `degraded: ${parsed.data.degradedComponents.slice(0, 3).join(", ")}`,
  });
};

const parseGoogleCloudHealth: HealthParse = (raw) => {
  const parsed = parseGoogleCloudIncidents(raw);
  if (!parsed.ok) return parsed;
  return parseOk({
    level: parsed.data.level,
    error: `open incidents: ${parsed.data.openIncidents.slice(0, 3).join("; ")}`,
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
  const { level, error } = parsed.data;
  if (level === "error") return { ok: false, warn: false, status: 200, latencyMs, error };
  return { ok: true, warn: level === "warn", status: 200, latencyMs, error: null };
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

type ProviderStatusId =
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
    PROVIDER_CONCURRENCY,
  );
  const results: (readonly [ProviderStatusId, ProviderStatusResult])[] = [];
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i]!;
    const target = PROVIDER_STATUS_TARGETS[i]!;
    if (s.status === "fulfilled") {
      const [id, result] = s.value;
      if (result !== null) results.push([id, result] as const);
    } else {
      ctx.log("warn", `[provider-status] ${target.label} sampling threw, skipping round`);
    }
  }
  return new Map(results);
}
