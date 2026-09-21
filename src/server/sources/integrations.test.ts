import { describe, expect, it } from "vitest";
import { fetchProviderStatuses } from "@/server/sources/provider-status";
import {
  parseGoogleCloudIncidents as parseGoogleCloudIncidentsResult,
  parseStatuspageSummary as parseStatuspageSummaryResult,
} from "@/server/parsers/provider-status";
import type { AppContext } from "@/server/context";
import { parseDailyPapers as parseDailyPapersResult } from "@/server/parsers/huggingface";
import { parseLitellmPricing as parseLitellmPricingResult } from "@/server/parsers/official-pricing";
import { SOURCE_LIMITS } from "@/shared/config";

/** Unwrap a successful ParseResult; failure surfaces as a thrown error. */
function unwrap<T>(res: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

const parseStatuspageSummary = (raw: unknown) => unwrap(parseStatuspageSummaryResult(raw));
const parseGoogleCloudIncidents = (raw: unknown) => unwrap(parseGoogleCloudIncidentsResult(raw));
const parseDailyPapers = (raw: unknown) => unwrap(parseDailyPapersResult(raw));
const parseLitellmPricing = (raw: unknown) => unwrap(parseLitellmPricingResult(raw));

const healthyStatuspage = (indicator = "none") => ({
  status: { indicator, description: indicator === "none" ? "All Systems Operational" : "Degraded" },
  components: [{ name: "API", status: "operational" }],
});
const ctxWithJson = (json: (url: string) => Promise<unknown>) =>
  ({ http: { json }, log: () => {} }) as unknown as AppContext;
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
    [
      "page indicator none wins over a single degraded component",
      {
        status: { indicator: "none", description: "All Systems Operational" },
        components: [
          { name: "API", status: "operational" },
          { name: "Edge helper", status: "degraded_performance" },
        ],
      },
      "ok",
      ["Edge helper"],
    ],
  ])("%s", (_label, raw, level, degradedComponents) => {
    const out = parseStatuspageSummary(raw);
    expect(out.level).toBe(level);
    if (degradedComponents !== undefined) expect(out.degradedComponents).toEqual(degradedComponents);
  });

  it.each([
    ["minor", "warn"],
    ["major", "error"],
    ["critical", "error"],
    // Maintenance and unrecognised indicators are degraded, not down.
    ["maintenance", "warn"],
    ["something-new", "warn"],
  ])("page indicator %s maps to %s", (indicator, level) => {
    expect(parseStatuspageSummary(healthyStatuspage(indicator)).level).toBe(level);
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
    [
      "open incident without severity warns (an unreadable severity is not an outage)",
      [{ external_desc: "Mystery", end: null }],
      "warn",
      ["Mystery"],
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
  it("skips providers whose status page fetch fails instead of marking them down", async () => {
    const ctx = ctxWithJson(async (url: string) => {
      if (url.includes("deepseek")) throw new Error("timeout");
      if (url.includes("status.cloud.google.com")) return [];
      return healthyStatuspage();
    });
    const map = await fetchProviderStatuses(ctx);
    expect(map.has("deepseekApi")).toBe(false);
    expect(map.get("cerebrasApi")).toMatchObject({ ok: true });
    expect(map.get("googleCloudApi")).toMatchObject({ ok: true });
  });

  it("returns an empty map when every fetch fails (no confident verdicts)", async () => {
    const map = await fetchProviderStatuses(
      ctxWithJson(async () => {
        throw new Error("network down");
      }),
    );
    expect(map.size).toBe(0);
  });

  it("skips unparseable payloads instead of marking them down", async () => {
    const ctx = ctxWithJson(async (url: string) => {
      if (url.includes("status.cloud.google.com")) return [];
      return { nope: true };
    });
    const map = await fetchProviderStatuses(ctx);
    expect(map.has("openaiApi")).toBe(false);
    expect(map.get("googleCloudApi")).toMatchObject({ ok: true });
  });

  it("maps a minor incident to ok+warn instead of an outage", async () => {
    const map = await fetchProviderStatuses(ctxWithJson(async () => healthyStatuspage("minor")));
    expect(map.get("openaiApi")).toMatchObject({ ok: true, warn: true, error: null });
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

  it("sorts by upvotes descending and dedupes by id", () => {
    const out = parseDailyPapers([
      paper("a", "Low", 3),
      paper("b", "High", 99),
      paper("a", "Dup", 5),
      paper("c", "Mid", 42),
    ]);
    expect(out.map((x) => x.title)).toEqual(["High", "Mid", "Dup"]);
  });

  it("drops rows failing the news gate (placeholder/garbage titles)", () => {
    expect(parseDailyPapers([paper("x", "test", 10), paper("y", "Real Paper", 1)]).map((x) => x.id)).toEqual([
      "hf-paper-y",
    ]);
  });

  it("caps at SOURCE_LIMITS.dailyPapers items", () => {
    expect(
      parseDailyPapers(Array.from({ length: 40 }, (_, i) => paper(`id-${i}`, `Paper ${i}`, 100 - i))),
    ).toHaveLength(SOURCE_LIMITS.dailyPapers);
  });

  it("fails on non-array or all-unusable payloads", () => {
    expect(parseDailyPapersResult({ nope: 1 }).ok).toBe(false);
    const unusable = parseDailyPapersResult([paper("x", "test", 1)]);
    expect(unusable.ok).toBe(false);
    expect(unusable.ok ? "" : unusable.error).toMatch(/0 usable/);
  });
});

describe("parseLitellmPricing", () => {
  const spec = {
    sample_spec: { input_cost_per_token: 0 },
    "openai/gpt-5": {
      mode: "chat",
      input_cost_per_token: 0.00000125,
      output_cost_per_token: 0.00001,
      cache_read_input_token_cost: 0.000000125,
      max_input_tokens: 400000,
    },
    "azure_ai/gpt-5": { mode: "chat", input_cost_per_token: 9, output_cost_per_token: 9 },
    "openai/text-embedding-3": { mode: "embedding", input_cost_per_token: 0.00000002 },
    "mystery/model": { mode: "chat", input_cost_per_token: 1, output_cost_per_token: 1 },
    "openai/ft:gpt-5": { mode: "chat", input_cost_per_token: 1, output_cost_per_token: 1 },
    "openai/gpt-free": { mode: "chat" },
    "anthropic/claude-opus-4": {
      mode: "chat",
      input_cost_per_token: 0.000015,
      output_cost_per_token: 0.000075,
    },
  };

  it("maps per-token costs to per-1M rows and resolves providers", () => {
    const out = parseLitellmPricing(spec);
    expect(out.find((m) => m.id === "gpt-5")).toMatchObject({
      provider: "openai",
      input: 1.25,
      output: 10,
      cachedInput: 0.125,
    });
    expect(out.find((m) => m.id === "claude-opus-4")).toMatchObject({
      provider: "anthropic",
      input: 15,
      output: 75,
      cachedInput: null,
    });
  });

  it("keeps exactly one row per model id (dupes/modes/unmatched skipped)", () => {
    expect(
      parseLitellmPricing(spec)
        .map((m) => m.id)
        .sort(),
    ).toEqual(["claude-opus-4", "gpt-5"]);
  });

  it("fails on non-object payloads or zero usable rows", () => {
    expect(parseLitellmPricingResult("nope").ok).toBe(false);
    const zeroRows = parseLitellmPricingResult({ sample_spec: {} });
    expect(zeroRows.ok).toBe(false);
    expect(zeroRows.ok ? "" : zeroRows.error).toMatch(/0 usable rows/);
  });

  it("resolves newer provider families instead of dropping them", () => {
    const byId = new Map(
      parseLitellmPricing({
        "openai/o3": { mode: "chat", input_cost_per_token: 0.000002, output_cost_per_token: 0.000008 },
        "google/gemma-3": { mode: "chat", input_cost_per_token: 0.0000005, output_cost_per_token: 0.000001 },
        "qwen/qwen3-max": { mode: "chat", input_cost_per_token: 0.000001, output_cost_per_token: 0.000003 },
        "meta-llama/llama-4": { mode: "chat", input_cost_per_token: 0.000001, output_cost_per_token: 0.000002 },
        "xai/grok-4": { mode: "chat", input_cost_per_token: 0.000003, output_cost_per_token: 0.000015 },
      }).map((m) => [m.id, m.provider]),
    );
    expect([...byId]).toEqual([
      ["o3", "openai"],
      ["gemma-3", "google"],
      ["qwen3-max", "qwen"],
      ["llama-4", "meta"],
      ["grok-4", "xai"],
    ]);
  });
});
