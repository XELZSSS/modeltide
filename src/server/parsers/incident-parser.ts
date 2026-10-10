import { obj, str, truncateSafe } from "@/server/parsers/parser-primitives";
import type { SourceIncident, SourceIncidentUpdate, SourceLevel } from "@/shared/types";
import { parseFail, parseOk, type ParseResult } from "@/server/parsers/parse-result";
import type { GcpIncidentRaw, StatuspageSummaryRaw } from "@/server/parsers/upstream-types";

const HEALTHY_COMPONENT_STATES = new Set(["operational"]);

const ERROR_COMPONENT_STATES = new Set(["partial_outage", "major_outage", "critical_outage"]);

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

const INCIDENT_LOG_MAX_INCIDENTS = 10;
const INCIDENT_LOG_MAX_UPDATES = 10;
const INCIDENT_LOG_MAX_NAME_CHARS = 150;
const INCIDENT_LOG_MAX_BODY_CHARS = 1500;

const HTML_TAG_RE = /<[^>]*>/g;
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

function plainText(html: string): string {
  const decoded = html.replace(/&(amp|lt|gt|quot|nbsp|#39);/g, (m) => HTML_ENTITIES[m] ?? m);
  return decoded
    .replace(HTML_TAG_RE, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .replace(/[ \t]+([.,;:!?])/g, "$1");
}

function incidentTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return Number.isNaN(Date.parse(trimmed)) ? null : trimmed;
}

function readStatuspageUpdates(raw: unknown): SourceIncidentUpdate[] {
  if (!Array.isArray(raw)) return [];
  const updates: SourceIncidentUpdate[] = [];
  for (const entry of raw.slice(0, INCIDENT_LOG_MAX_UPDATES)) {
    const update = obj(entry);
    if (!update) continue;
    const body = plainText(str(update.body)).trim();
    if (!body) continue;
    updates.push({
      body: truncateSafe(body, INCIDENT_LOG_MAX_BODY_CHARS),
      status: str(update.status).trim() || "update",
      createdAt: incidentTimestamp(update.created_at ?? update.display_at),
    });
  }
  return updates;
}

export function parseStatuspageIncidents(raw: unknown): ParseResult<SourceIncident[]> {
  const root = obj(raw);
  const list = root?.incidents;
  if (!Array.isArray(list)) return parseFail("Statuspage incidents payload has no incidents array");
  const incidents: SourceIncident[] = [];
  for (const entry of list.slice(0, INCIDENT_LOG_MAX_INCIDENTS)) {
    const incident = obj(entry);
    if (!incident) continue;
    const name = str(incident.name).trim();
    if (!name) continue;
    const id = str(incident.id).trim() || name;
    incidents.push({
      id: truncateSafe(id, 64),
      name: truncateSafe(name, INCIDENT_LOG_MAX_NAME_CHARS),
      status: str(incident.status).trim() || "unknown",
      impact: str(incident.impact).trim() || null,
      createdAt: incidentTimestamp(incident.created_at),
      updatedAt: incidentTimestamp(incident.updated_at),
      shortlink: str(incident.shortlink).trim() || null,
      updates: readStatuspageUpdates(incident.incident_updates),
    });
  }
  return parseOk(incidents);
}

function readGcpUpdates(raw: unknown): SourceIncidentUpdate[] {
  if (!Array.isArray(raw)) return [];
  const updates: SourceIncidentUpdate[] = [];
  for (const entry of raw.slice(0, INCIDENT_LOG_MAX_UPDATES)) {
    const update = obj(entry);
    if (!update) continue;
    const body = str(update.text).trim();
    if (!body) continue;
    updates.push({
      body: truncateSafe(body, INCIDENT_LOG_MAX_BODY_CHARS),
      status: str(update.status).trim() || "update",
      createdAt: incidentTimestamp(update.when ?? update.created),
    });
  }
  return updates;
}

export function parseGoogleCloudIncidentLog(raw: unknown): ParseResult<SourceIncident[]> {
  if (!Array.isArray(raw)) return parseFail("Google Cloud status returned a non-array payload");
  const incidents: SourceIncident[] = [];
  for (const entry of raw.slice(0, INCIDENT_LOG_MAX_INCIDENTS)) {
    const incident = obj(entry);
    if (!incident) continue;
    const name = str(incident.external_desc).trim();
    if (!name && !incident.updates && !incident.most_recent_update) continue;
    const ended = str(incident.end).trim() !== "";
    const recent = obj(incident.most_recent_update);
    incidents.push({
      id: truncateSafe(str(incident.number ?? incident.id).trim() || name, 64),
      name: truncateSafe(name || "Google Cloud incident", INCIDENT_LOG_MAX_NAME_CHARS),
      status: ended ? "resolved" : str(recent?.status).trim() || "update",
      impact: str(incident.severity).trim() || null,
      createdAt: incidentTimestamp(incident.begin ?? incident.created),
      updatedAt: incidentTimestamp(incident.modified),
      shortlink: str(incident.uri).trim() || null,
      updates: readGcpUpdates(incident.updates),
    });
  }
  return parseOk(incidents);
}
