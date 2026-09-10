import { UpstreamError } from "@/server/infra/errors";
import { obj, str } from "@/server/parsers/primitives";
import type { SourceLevel } from "@/shared/types";

const HEALTHY_COMPONENT_STATES = new Set(["operational"]);

// Component states meaning a partial/major outage (error) vs mere degradation (warn).
const ERROR_COMPONENT_STATES = new Set(["partial_outage", "major_outage", "critical_outage"]);

// Page-level verdicts reported by Statuspage (`summary.json` → `status.indicator`).
// "none" = all operational (ok); "minor" = degraded but up (warn, the provider's own
// yellow state); anything else (major/critical/maintenance) = outage (error).
// The page indicator is the provider's own communicated verdict and the only thing
// that decides the level when present: per-component states are kept as detail text,
// but a single degraded edge component must not flip the whole provider — that
// produced a down/up flap on nearly every sampling round.
const WARN_PAGE_INDICATORS = new Set(["minor"]);

export interface StatuspageVerdict {
  level: SourceLevel;
  degradedComponents: string[];
  total: number;
}

export function parseStatuspageSummary(raw: unknown): StatuspageVerdict {
  const root = obj(raw);
  const componentsRaw = root?.components;
  if (!Array.isArray(componentsRaw) || componentsRaw.length === 0) {
    throw new UpstreamError("Statuspage summary has no components array");
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
    throw new UpstreamError("Statuspage summary has no readable component states");
  }
  // Prefer the page-level indicator when the payload carries one; fall back to the
  // component rule for non-standard shapes so unknown payloads fail closed, not open.
  const indicator = str(obj(root?.status)?.indicator).trim().toLowerCase();
  const level: SourceLevel = indicator
    ? indicator === "none"
      ? "ok"
      : WARN_PAGE_INDICATORS.has(indicator)
        ? "warn"
        : "error"
    : worst;
  return { level, degradedComponents, total };
}

interface GcpIncident {
  external_desc?: unknown;
  end?: unknown;
  severity?: unknown;
}

const GCP_ROUTINE_SEVERITIES = new Set(["low"]);
// Medium incidents degrade the service without taking it down (warn); high (or an
// unknown severity) is treated as an outage.
const GCP_WARN_SEVERITIES = new Set(["medium"]);

export function parseGoogleCloudIncidents(raw: unknown): { level: SourceLevel; openIncidents: string[] } {
  if (!Array.isArray(raw)) {
    throw new UpstreamError("Google Cloud status returned a non-array payload");
  }
  const openIncidents: string[] = [];
  let worst: SourceLevel = "ok";
  for (const entry of raw as GcpIncident[]) {
    const incident = obj(entry);
    if (!incident) continue;
    if (str(incident.end).trim()) continue;
    const severity = str(incident.severity).trim().toLowerCase();
    if (GCP_ROUTINE_SEVERITIES.has(severity)) continue;
    openIncidents.push(str(incident.external_desc).trim().slice(0, 120) || severity || "open incident");
    if (!GCP_WARN_SEVERITIES.has(severity)) worst = "error";
    else if (worst === "ok") worst = "warn";
  }
  return { level: worst, openIncidents };
}
