import { cacheKeys, PROVIDER_STATUS_FETCH_OPTS, providerStatusEndpoints } from "@/server/config";
import { FIVE_MINUTES } from "@/shared/config";
import { parseGoogleCloudIncidentLog, parseStatuspageIncidents } from "@/server/parsers/incident-parser";
import { cachedPayload } from "@/server/sources/pipeline";
import type { SourceId, SourceIncident, SourceIncidentLog, SourcePayload } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { errMsg } from "@/server/infra/errors";

interface IncidentEndpoint {
  url: string;
  pageUrl: string;
  kind: "statuspage" | "gcp";
}

const STATUSPAGE_API_SUFFIX = "/api/v2/summary.json";

function incidentsEndpoint(id: string): IncidentEndpoint | null {
  if (id === "googleCloudApi") {
    return { url: providerStatusEndpoints.googleCloudApi, pageUrl: "https://status.cloud.google.com", kind: "gcp" };
  }
  const summary = (providerStatusEndpoints as Record<string, string>)[id];
  if (!summary || !summary.endsWith(STATUSPAGE_API_SUFFIX)) return null;
  const base = summary.slice(0, -STATUSPAGE_API_SUFFIX.length);
  return { url: `${base}/api/v2/incidents.json?per_page=10`, pageUrl: base, kind: "statuspage" };
}

async function fetchIncidentLog(ctx: AppContext, endpoint: IncidentEndpoint): Promise<SourceIncident[]> {
  const response = await ctx.http.jsonWithStatus<unknown>(endpoint.url, PROVIDER_STATUS_FETCH_OPTS);
  const parsed =
    endpoint.kind === "gcp" ? parseGoogleCloudIncidentLog(response.body) : parseStatuspageIncidents(response.body);
  if (!parsed.ok) {
    ctx.log("warn", `[incident-log] parse failed for ${endpoint.url}: ${parsed.error}`);
    return [];
  }
  return parsed.data;
}

export function getSourceIncidentLog(ctx: AppContext, id: string): Promise<SourcePayload<SourceIncidentLog>> {
  const source = id as SourceId;
  return cachedPayload(ctx, cacheKeys.sourceIncidents(source), FIVE_MINUTES, async (ctx) => {
    const endpoint = incidentsEndpoint(id);
    if (!endpoint) {
      const rows: SourceIncidentLog = { source, pageUrl: null, incidents: [] };
      return { rows };
    }
    try {
      const rows: SourceIncidentLog = {
        source,
        pageUrl: endpoint.pageUrl,
        incidents: await fetchIncidentLog(ctx, endpoint),
      };
      return { rows };
    } catch (err) {
      ctx.log("warn", `[incident-log] fetch failed for ${endpoint.url}: ${errMsg(err)}`);
      const rows: SourceIncidentLog = { source, pageUrl: endpoint.pageUrl, incidents: [] };
      return { rows, partial: true };
    }
  });
}
