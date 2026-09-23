import { describe, expect, it } from "vitest";
import { fetchProviderStatuses } from "@/server/sources/incident-source";
import {
  parseGoogleCloudIncidents as parseGoogleCloudIncidentsResult,
  parseStatuspageSummary as parseStatuspageSummaryResult,
} from "@/server/parsers/incident-parser";
import { parseDailyPapers as parseDailyPapersResult } from "@/server/parsers/hf-parser";
import { fakeHttp, testCtx } from "@/server/test-helpers";

function unwrap<T>(res: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

const parseStatuspageSummary = (raw: unknown) => unwrap(parseStatuspageSummaryResult(raw));
const parseGoogleCloudIncidents = (raw: unknown) => unwrap(parseGoogleCloudIncidentsResult(raw));
const parseDailyPapers = (raw: unknown) => unwrap(parseDailyPapersResult(raw));

const healthyStatuspage = (indicator = "none") => ({
  status: { indicator, description: indicator === "none" ? "All Systems Operational" : "Degraded" },
  components: [{ name: "API", status: "operational" }],
});
const ctxWithJson = (json: (url: string) => Promise<unknown>) => testCtx(new Map(), { http: fakeHttp({ json }) }).ctx;
const paper = (id: string, title: string, upvotes: number, publishedAt = "2026-09-05T00:00:00.000Z") => ({
  paper: { id, title, upvotes, publishedAt },
});

describe("parseStatuspageSummary", () => {
  it("is healthy when every component is operational", () => {
    expect(
      parseStatuspageSummary({
        components: [
          { name: "API", status: "operational" },
          { name: "Chat", status: "operational" },
        ],
      }),
    ).toMatchObject({ level: "ok", degradedComponents: [] });
  });

  it.each([
    [
      "outage-state component without page indicator fails closed",
      {
        components: [
          { name: "API", status: "operational" },
          { name: "Images", status: "degraded_performance" },
          { name: "", status: "partial_outage" },
        ],
      },
      "error",
      ["Images", "partial_outage"],
    ],
    [
      "degradation-only without page indicator warns",
      {
        components: [
          { name: "API", status: "operational" },
          { name: "Images", status: "degraded_performance" },
        ],
      },
      "warn",
      undefined,
    ],
  ])("%s", (_label, raw, level, degradedComponents) => {
    const out = parseStatuspageSummary(raw);
    expect(out.level).toBe(level);
    if (degradedComponents !== undefined) expect(out.degradedComponents).toEqual(degradedComponents);
  });

  it.each([
    ["minor", "warn"],
    ["major", "error"],
    // Maintenance and unrecognised indicators are degraded, not down.
    ["maintenance", "warn"],
  ])("page indicator %s maps to %s", (indicator, level) => {
    expect(parseStatuspageSummary(healthyStatuspage(indicator)).level).toBe(level);
  });

  it("reads the page headline and the active incident names as the warning content", () => {
    const out = parseStatuspageSummary({
      status: { indicator: "minor", description: "Partially Degraded Service" },
      components: [{ name: "API", status: "degraded_performance" }],
      incidents: [
        { name: "Elevated error rates", status: "investigating", impact: "minor" },
        { name: "Resolved outage", status: "resolved", impact: "major" },
        { name: "Informational note", status: "monitoring", impact: "none" },
      ],
    });
    expect(out).toMatchObject({
      level: "warn",
      pageDescription: "Partially Degraded Service",
      activeIncidents: ["Elevated error rates"],
    });
  });

  it("fails closed on empty or unreadable component lists", () => {
    expect(parseStatuspageSummaryResult({ components: [] }).ok).toBe(false);
    expect(parseStatuspageSummaryResult({ components: [{ name: "x", status: "" }] }).ok).toBe(false);
    expect(parseStatuspageSummaryResult({}).ok).toBe(false);
  });
});

describe("parseGoogleCloudIncidents", () => {
  it.each([
    [
      "closed incidents are healthy",
      [
        { external_desc: "Network degradation", end: "2026-09-01T18:52:00+00:00", severity: "medium" },
        { external_desc: "Compute issue", end: null, severity: "low" },
      ],
      "ok",
      [],
    ],
    [
      "open medium-severity warns",
      [
        { external_desc: "Open degradation", end: null, severity: "medium" },
        { external_desc: "Routine", end: null, severity: "low" },
      ],
      "warn",
      ["Open degradation"],
    ],
    [
      "open high-severity errors",
      [
        { external_desc: "Closed", end: "2026-09-01T18:52:00+00:00", severity: "high" },
        { external_desc: "Open outage", end: null, severity: "high" },
        { external_desc: "Routine", end: null, severity: "low" },
      ],
      "error",
      ["Open outage"],
    ],
  ])("%s", (_label, raw, level, openIncidents) => {
    const out = parseGoogleCloudIncidents(raw);
    expect(out.level).toBe(level);
    expect(out.openIncidents).toEqual(openIncidents);
  });

  it("fails on a non-array payload", () => {
    const res = parseGoogleCloudIncidentsResult({ nope: true });
    expect(res.ok).toBe(false);
    expect(res.ok ? "" : res.error).toMatch(/non-array/);
  });
});

describe("fetchProviderStatuses", () => {
  it("skips failed or unparseable providers instead of marking them down", async () => {
    const throwing = await fetchProviderStatuses(
      ctxWithJson(async (url: string) => {
        if (url.includes("deepseek")) throw new Error("timeout");
        if (url.includes("status.cloud.google.com")) return [];
        return healthyStatuspage();
      }),
    );
    expect(throwing.has("deepseekApi")).toBe(false);
    expect(throwing.get("cerebrasApi")).toMatchObject({ ok: true });
    expect(throwing.get("googleCloudApi")).toMatchObject({ ok: true });

    const unparseable = await fetchProviderStatuses(
      ctxWithJson(async (url: string) => {
        if (url.includes("status.cloud.google.com")) return [];
        return { nope: true };
      }),
    );
    expect(unparseable.has("openaiApi")).toBe(false);
    expect(unparseable.get("googleCloudApi")).toMatchObject({ ok: true });
  });

  it("reports the provider's warning text instead of a bare degraded flag", async () => {
    const map = await fetchProviderStatuses(
      ctxWithJson(async () => ({
        status: { indicator: "minor", description: "Partially Degraded Service" },
        components: [{ name: "API", status: "degraded_performance" }],
        incidents: [{ name: "Elevated error rates on the API", status: "investigating", impact: "minor" }],
      })),
    );
    expect(map.get("openaiApi")).toMatchObject({
      ok: true,
      warn: true,
      warnReason: "Partially Degraded Service: Elevated error rates on the API",
      error: null,
    });
  });

  it("returns an empty map when every fetch fails (no confident verdicts)", async () => {
    const map = await fetchProviderStatuses(
      ctxWithJson(async () => {
        throw new Error("network down");
      }),
    );
    expect(map.size).toBe(0);
  });
});

describe("parseDailyPapers", () => {
  it("maps entries to NewsItems with hf-paper ids and HF links", () => {
    const out = parseDailyPapers([paper("2609.03199", "A  Cool   Paper", 115)]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "hf-paper-2609.03199",
      title: "A Cool Paper",
      link: "https://huggingface.co/papers/2609.03199",
      source: "Hugging Face Papers",
      pubDate: "2026-09-05T00:00:00.000Z",
    });
  });

  it("drops rows failing the news gate (placeholder/garbage titles)", () => {
    expect(parseDailyPapers([paper("x", "test", 10), paper("y", "Real Paper", 1)]).map((x) => x.id)).toEqual([
      "hf-paper-y",
    ]);
  });

  it("fails on non-array or all-unusable payloads", () => {
    expect(parseDailyPapersResult({ nope: 1 }).ok).toBe(false);
    const unusable = parseDailyPapersResult([paper("x", "test", 1)]);
    expect(unusable.ok).toBe(false);
    expect(unusable.ok ? "" : unusable.error).toMatch(/0 usable/);
  });
});
