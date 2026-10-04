import type { AppContext } from "@/server/context";
import { PROVIDER_CONCURRENCY, PROVIDER_STATUS_FETCH_OPTS, providerStatusEndpoints } from "@/server/config";
import { errMsg, UpstreamError } from "@/server/infra/errors";
import { runCapped } from "@/server/infra/task-pool";
import { sourceAggregate, type SourceAggregate } from "@/server/sources/status/aggregate";
import { parseGoogleCloudIncidents, parseStatuspageSummary } from "@/server/parsers/incident-parser";
import { parseOk, type ParseResult } from "@/server/parsers/parse-result";
import type { SourceId, SourceLevel } from "@/shared/types";

type HealthParse = (raw: unknown) => ParseResult<{ level: SourceLevel; detail: string }>;

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

function upstreamStatusOf(err: unknown): number | null {
  return err instanceof UpstreamError && typeof err.statusCode === "number" ? err.statusCode : null;
}

async function fetchProviderHealth(
  ctx: AppContext,
  url: string,
  label: string,
  parse: HealthParse,
): Promise<SourceAggregate> {
  const started = Date.now();
  let response: { status: number; body: unknown };
  try {
    response = await ctx.http.jsonWithStatus<unknown>(url, PROVIDER_STATUS_FETCH_OPTS);
  } catch (err) {
    const message = errMsg(err);
    ctx.log("warn", `[provider-status] ${label} fetch failed: ${message}`);
    return sourceAggregate({ ok: false, status: upstreamStatusOf(err), latencyMs: null, detail: message });
  }
  const latencyMs = Date.now() - started;
  const parsed = parse(response.body);
  if (!parsed.ok) {
    ctx.log("warn", `[provider-status] ${label} parse failed: ${parsed.error}`);
    return sourceAggregate({ ok: false, status: response.status, latencyMs: null, detail: parsed.error });
  }
  const { level, detail } = parsed.data;
  const ok = level !== "error";
  return sourceAggregate({
    ok,
    degraded: level === "warn",
    status: response.status,
    latencyMs: ok ? latencyMs : null,
    detail,
  });
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

export async function fetchProviderStatuses(ctx: AppContext): Promise<Map<SourceId, SourceAggregate>> {
  const settled = await runCapped(
    PROVIDER_STATUS_TARGETS.map((target) => async (): Promise<readonly [SourceId, SourceAggregate]> => [
      target.id,
      await fetchProviderHealth(ctx, target.url, target.label, target.parse),
    ]),
    PROVIDER_CONCURRENCY,
  );
  return new Map(settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : [])));
}
