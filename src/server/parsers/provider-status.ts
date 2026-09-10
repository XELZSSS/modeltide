import { UpstreamError } from "@/server/infra/errors";
import { obj, str } from "@/server/parsers/primitives";

const HEALTHY_COMPONENT_STATES = new Set(["operational"]);

// Page-level verdicts reported by Statuspage (`summary.json` → `status.indicator`).
// This is the provider's own communicated state ("All Systems Operational" vs an
// incident banner) and the only thing that may flip a source to down.
// Per-component states are kept as detail text for the error message, but a single
// degraded edge component must not flip the whole provider: that produced a
// down/up flap on nearly every sampling round.
const HEALTHY_PAGE_INDICATORS = new Set(["none"]);

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
  // Prefer the page-level indicator when the payload carries one; fall back to the
  // component rule for non-standard shapes so unknown payloads fail closed, not open.
  const indicator = str(obj(root?.status)?.indicator).trim().toLowerCase();
  const ok = indicator ? HEALTHY_PAGE_INDICATORS.has(indicator) : degradedComponents.length === 0;
  return { ok, degradedComponents, total };
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
