import { obj, str } from "@/server/parsers/primitives";
import type { SourceLevel } from "@/shared/types";
import { parseFail, parseOk, type ParseResult } from "@/server/parsers/result";
import type { GcpIncidentRaw, StatuspageSummaryRaw } from "@/server/parsers/upstream";

const HEALTHY_COMPONENT_STATES = new Set(["operational"]);

const ERROR_COMPONENT_STATES = new Set(["partial_outage", "major_outage", "critical_outage"]);

const WARN_PAGE_INDICATORS = new Set(["minor"]);

export interface StatuspageVerdict {
  level: SourceLevel;
  degradedComponents: string[];
  total: number;
}

export function parseStatuspageSummary(raw: unknown): ParseResult<StatuspageVerdict> {
  const root = obj(raw) as StatuspageSummaryRaw | undefined;
  const componentsRaw = root?.components;
  if (!Array.isArray(componentsRaw) || componentsRaw.length === 0) {
    return parseFail("Statuspage summary has no components array");
  }
  const degradedComponents: string[] = [];
  let worst: SourceLevel = "ok";
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
      if (ERROR_COMPONENT_STATES.has(status)) worst = "error";
      else if (worst !== "error") worst = "warn";
    }
  }
  if (total === 0) {
    return parseFail("Statuspage summary has no readable component states");
  }
  const indicator = str(obj(root?.status)?.indicator).trim().toLowerCase();
  const level: SourceLevel = indicator
    ? indicator === "none"
      ? "ok"
      : WARN_PAGE_INDICATORS.has(indicator)
        ? "warn"
        : "error"
    : worst;
  return parseOk({ level, degradedComponents, total });
}

const GCP_ROUTINE_SEVERITIES = new Set(["low"]);
const GCP_WARN_SEVERITIES = new Set(["medium"]);

export function parseGoogleCloudIncidents(raw: unknown): ParseResult<{ level: SourceLevel; openIncidents: string[] }> {
  if (!Array.isArray(raw)) {
    return parseFail("Google Cloud status returned a non-array payload");
  }
  const openIncidents: string[] = [];
  let worst: SourceLevel = "ok";
  for (const entry of raw as GcpIncidentRaw[]) {
    const incident = obj(entry);
    if (!incident) continue;
    if (str(incident.end).trim()) continue;
    const severity = str(incident.severity).trim().toLowerCase();
    if (GCP_ROUTINE_SEVERITIES.has(severity)) continue;
    openIncidents.push(str(incident.external_desc).trim().slice(0, 120) || severity || "open incident");
    if (!GCP_WARN_SEVERITIES.has(severity)) worst = "error";
    else if (worst === "ok") worst = "warn";
  }
  return parseOk({ level: worst, openIncidents });
}
