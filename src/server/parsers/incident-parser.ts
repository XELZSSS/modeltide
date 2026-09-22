import { obj, str } from "@/server/parsers/parser-primitives";
import type { SourceLevel } from "@/shared/types";
import { parseFail, parseOk, type ParseResult } from "@/server/parsers/parse-result";
import type { GcpIncidentRaw, StatuspageSummaryRaw } from "@/server/parsers/upstream-types";

const HEALTHY_COMPONENT_STATES = new Set(["operational"]);

const ERROR_COMPONENT_STATES = new Set(["partial_outage", "major_outage", "critical_outage"]);

/**
 * Statuspage's indicator enum is `none | maintenance | minor | major | critical`.
 * `maintenance` is scheduled work (components stay operational) and an unknown
 * value is no evidence of an outage, so neither may be treated as an error.
 */
const ERROR_PAGE_INDICATORS = new Set(["major", "critical"]);

function indicatorLevel(indicator: string): SourceLevel {
  if (indicator === "none") return "ok";
  if (ERROR_PAGE_INDICATORS.has(indicator)) return "error";
  // "minor", "maintenance" and anything unrecognised: degraded, not down.
  return "warn";
}

interface StatuspageVerdict {
  level: SourceLevel;
  degradedComponents: string[];
  /** The page's own headline, e.g. "Minor Service Outage". */
  pageDescription: string;
  /** Names of unresolved, non-informational incidents — the actual warning content. */
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
  // The coarser page indicator wins when present, mapped via explicit bands.
  const level: SourceLevel = indicator ? indicatorLevel(indicator) : worst;
  return parseOk({
    level,
    degradedComponents,
    pageDescription: str(obj(root?.status)?.description).trim().slice(0, 120),
    activeIncidents: readActiveIncidentNames(root?.incidents),
  });
}

/** Unresolved incidents with a real impact: informational/"none" ones are not warnings. */
function readActiveIncidentNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const names: string[] = [];
  for (const entry of raw.slice(0, 20)) {
    const incident = obj(entry);
    if (!incident) continue;
    if (RESOLVED_INCIDENT_STATES.has(str(incident.status).trim().toLowerCase())) continue;
    if (str(incident.impact).trim().toLowerCase() === "none") continue;
    const name = str(incident.name).trim();
    if (name) names.push(name.slice(0, 120));
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
    // `end` marks a resolved incident. Accept any non-empty rendered value so
    // a numeric/boolean regression doesn't flip closed incidents to open.
    const endRaw = (incident as Record<string, unknown>).end;
    const ended = endRaw != null && String(endRaw).trim() !== "";
    if (ended) continue;
    const severityRaw = (incident as Record<string, unknown>).severity;
    const severity = typeof severityRaw === "string" ? severityRaw.trim().toLowerCase() : "";
    if (GCP_ROUTINE_SEVERITIES.has(severity)) continue;
    openIncidents.push(str(incident.external_desc).trim().slice(0, 120) || severity || "open incident");
    // Only explicit error bands are outages; medium or unknown is degraded.
    if (GCP_ERROR_SEVERITIES.has(severity)) worst = "error";
    else if (worst !== "error") worst = "warn";
  }
  return parseOk({ level: worst, openIncidents });
}
