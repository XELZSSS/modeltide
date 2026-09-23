import { obj, str, truncateSafe } from "@/server/parsers/parser-primitives";
import type { SourceLevel } from "@/shared/types";
import { parseFail, parseOk, type ParseResult } from "@/server/parsers/parse-result";
import type { GcpIncidentRaw, StatuspageSummaryRaw } from "@/server/parsers/upstream-types";

const HEALTHY_COMPONENT_STATES = new Set(["operational"]);

const ERROR_COMPONENT_STATES = new Set(["partial_outage", "major_outage", "critical_outage"]);

// Statuspage enum `none|maintenance|minor|major|critical`: `maintenance` and unknown are not errors.
const ERROR_PAGE_INDICATORS = new Set(["major", "critical"]);

function indicatorLevel(indicator: string): SourceLevel {
  if (indicator === "none") return "ok";
  if (ERROR_PAGE_INDICATORS.has(indicator)) return "error";
  return "warn";
}

interface StatuspageVerdict {
  level: SourceLevel;
  degradedComponents: string[];
  pageDescription: string;
  activeIncidents: string[];
}

const RESOLVED_INCIDENT_STATES = new Set(["resolved", "postmortem"]);

export function parseStatuspageSummary(raw: unknown): ParseResult<StatuspageVerdict> {
  const root = obj(raw) as StatuspageSummaryRaw | undefined;
  const componentsRaw = root?.components;
  if (!Array.isArray(componentsRaw) || componentsRaw.length === 0) {
    return parseFail("Statuspage summary has no components array");
  }
  const degradedComponents: string[] = [];
  let worst: SourceLevel = "ok";
  let readable = 0;
  const capped = componentsRaw.slice(0, 500);
  for (const entry of capped as unknown[]) {
    const c = obj(entry);
    if (!c) continue;
    const status = str(c.status).trim().toLowerCase();
    if (!status) continue;
    readable += 1;
    if (!HEALTHY_COMPONENT_STATES.has(status)) {
      const name = str(c.name).trim();
      degradedComponents.push(name || status);
      if (ERROR_COMPONENT_STATES.has(status)) worst = "error";
      else if (worst !== "error") worst = "warn";
    }
  }
  if (readable === 0) {
    return parseFail("Statuspage summary has no readable component states");
  }
  const indicator = str(obj(root?.status)?.indicator).trim().toLowerCase();
  const level: SourceLevel = indicator ? indicatorLevel(indicator) : worst;
  return parseOk({
    level,
    degradedComponents,
    pageDescription: truncateSafe(str(obj(root?.status)?.description).trim(), 120),
    activeIncidents: readActiveIncidentNames(root?.incidents),
  });
}

function readActiveIncidentNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const names: string[] = [];
  for (const entry of raw.slice(0, 20)) {
    const incident = obj(entry);
    if (!incident) continue;
    if (RESOLVED_INCIDENT_STATES.has(str(incident.status).trim().toLowerCase())) continue;
    if (str(incident.impact).trim().toLowerCase() === "none") continue;
    const name = str(incident.name).trim();
    if (name) names.push(truncateSafe(name, 120));
  }
  return names;
}

const GCP_ROUTINE_SEVERITIES = new Set(["low"]);
const GCP_ERROR_SEVERITIES = new Set(["high", "critical"]);

export function parseGoogleCloudIncidents(raw: unknown): ParseResult<{ level: SourceLevel; openIncidents: string[] }> {
  if (!Array.isArray(raw)) {
    return parseFail("Google Cloud status returned a non-array payload");
  }
  const openIncidents: string[] = [];
  let worst: SourceLevel = "ok";
  for (const entry of raw.slice(0, 500) as GcpIncidentRaw[]) {
    const incident = obj(entry);
    if (!incident) continue;
    // `end` marks a resolved incident; any non-empty value counts, so a type regression can't reopen it.
    const endRaw = (incident as Record<string, unknown>).end;
    const ended = endRaw != null && String(endRaw).trim() !== "";
    if (ended) continue;
    const severityRaw = (incident as Record<string, unknown>).severity;
    const severity = typeof severityRaw === "string" ? severityRaw.trim().toLowerCase() : "";
    if (GCP_ROUTINE_SEVERITIES.has(severity)) continue;
    openIncidents.push(truncateSafe(str(incident.external_desc).trim(), 120) || severity || "open incident");
    if (GCP_ERROR_SEVERITIES.has(severity)) worst = "error";
    else if (worst !== "error") worst = "warn";
  }
  return parseOk({ level: worst, openIncidents });
}
