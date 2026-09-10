import { describe, expect, it } from "vitest";
import { fetchProviderStatuses } from "@/server/sources/provider-status";
import { parseGoogleCloudIncidents, parseStatuspageSummary } from "@/server/parsers/provider-status";
import type { AppContext } from "@/server/context";
import { parseDailyPapers } from "@/server/parsers/hf-papers";
import { parseLitellmPricing } from "@/server/parsers/official-pricing";
import { SOURCE_LIMITS } from "@/shared/config";

describe("parseStatuspageSummary", () => {
  it("is healthy when every component is operational", () => {
    const out = parseStatuspageSummary({
      components: [
        { name: "API", status: "operational" },
        { name: "Chat", status: "operational" },
      ],
    });
    expect(out).toMatchObject({ level: "ok", total: 2 });
  });

  it("errors on an outage-state component when no page indicator exists (fail closed)", () => {
    const out = parseStatuspageSummary({
      components: [
        { name: "API", status: "operational" },
        { name: "Images", status: "degraded_performance" },
        { name: "", status: "partial_outage" },
      ],
    });
    expect(out.level).toBe("error");
    expect(out.degradedComponents).toEqual(["Images", "partial_outage"]);
  });

  it("warns on degradation-only components when no page indicator exists", () => {
    const out = parseStatuspageSummary({
      components: [
        { name: "API", status: "operational" },
        { name: "Images", status: "degraded_performance" },
      ],
    });
    expect(out.level).toBe("warn");
  });

  it("trusts the page indicator over a single degraded component", () => {
    const out = parseStatuspageSummary({
      status: { indicator: "none", description: "All Systems Operational" },
      components: [
        { name: "API", status: "operational" },
        { name: "Edge helper", status: "degraded_performance" },
      ],
    });
    expect(out.level).toBe("ok");
    expect(out.degradedComponents).toEqual(["Edge helper"]);
  });

  it("maps a minor page indicator to warn and worse indicators to error", () => {
    const parse = (indicator: string) =>
      parseStatuspageSummary({
        status: { indicator, description: "Something is off" },
        components: [{ name: "API", status: "operational" }],
      });
    expect(parse("minor").level).toBe("warn");
    for (const indicator of ["major", "critical", "maintenance"]) {
      expect(parse(indicator).level).toBe("error");
    }
  });

  it("throws on empty or unreadable component lists (fail closed)", () => {
    expect(() => parseStatuspageSummary({ components: [] })).toThrow(/no components/);
    expect(() => parseStatuspageSummary({ components: [{ name: "x", status: "" }] })).toThrow(/no readable/);
    expect(() => parseStatuspageSummary({})).toThrow(/no components/);
  });
});

describe("parseGoogleCloudIncidents", () => {
  it("is healthy when every incident is closed", () => {
    const out = parseGoogleCloudIncidents([
      { external_desc: "Network degradation", end: "2026-09-01T18:52:00+00:00", severity: "medium" },
      { external_desc: "Compute issue", end: null, severity: "low" },
    ]);
    expect(out).toMatchObject({ level: "ok", openIncidents: [] });
  });

  it("warns on open medium-severity incidents (degraded, not down)", () => {
    const out = parseGoogleCloudIncidents([
      { external_desc: "Open degradation", end: null, severity: "medium" },
      { external_desc: "Routine", end: null, severity: "low" },
    ]);
    expect(out.level).toBe("warn");
    expect(out.openIncidents).toEqual(["Open degradation"]);
  });

  it("errors on open incidents above warn severity", () => {
    const out = parseGoogleCloudIncidents([
      { external_desc: "Closed", end: "2026-09-01T18:52:00+00:00", severity: "high" },
      { external_desc: "Open outage", end: null, severity: "high" },
      { external_desc: "Routine", end: null, severity: "low" },
    ]);
    expect(out.level).toBe("error");
    expect(out.openIncidents).toEqual(["Open outage"]);
  });

  it("treats an open incident without severity as failing", () => {
    const out = parseGoogleCloudIncidents([{ external_desc: "Mystery", end: null }]);
    expect(out.level).toBe("error");
    expect(out.openIncidents).toEqual(["Mystery"]);
  });

  it("throws on a non-array payload", () => {
    expect(() => parseGoogleCloudIncidents({ nope: true })).toThrow(/non-array/);
  });
});

describe("fetchProviderStatuses", () => {
  const healthySummary = () => ({
    status: { indicator: "none", description: "All Systems Operational" },
    components: [{ name: "API", status: "operational" }],
  });
  const ctxWithJson = (json: (url: string) => Promise<unknown>) =>
    ({ http: { json }, log: () => {} }) as unknown as AppContext;

  it("skips providers whose status page fetch fails instead of marking them down", async () => {
    const ctx = ctxWithJson(async (url: string) => {
      if (url.includes("deepseek")) throw new Error("timeout");
      if (url.includes("status.cloud.google.com")) return [];
      return healthySummary();
    });
    const map = await fetchProviderStatuses(ctx);
    expect(map.has("deepseekApi")).toBe(false);
    expect(map.get("cerebrasApi")).toMatchObject({ ok: true });
    expect(map.get("googleCloudApi")).toMatchObject({ ok: true });
  });

  it("returns an empty map when every fetch fails (no confident verdicts)", async () => {
    const ctx = ctxWithJson(async () => {
      throw new Error("network down");
    });
    const map = await fetchProviderStatuses(ctx);
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
    const ctx = ctxWithJson(async () => ({
      status: { indicator: "minor", description: "Degraded" },
      components: [{ name: "API", status: "operational" }],
    }));
    const map = await fetchProviderStatuses(ctx);
    expect(map.get("openaiApi")).toMatchObject({ ok: true, warn: true, error: null });
  });
});

describe("parseDailyPapers", () => {
  const paper = (id: string, title: string, upvotes: number, publishedAt = "2026-09-05T00:00:00.000Z") => ({
    paper: { id, title, upvotes, publishedAt },
  });

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
    const out = parseDailyPapers([paper("x", "test", 10), paper("y", "Real Paper", 1)]);
    expect(out.map((x) => x.id)).toEqual(["hf-paper-y"]);
  });

  it("caps at SOURCE_LIMITS.dailyPapers items", () => {
    const many = Array.from({ length: 40 }, (_, i) => paper(`id-${i}`, `Paper ${i}`, 100 - i));
    expect(parseDailyPapers(many)).toHaveLength(SOURCE_LIMITS.dailyPapers);
  });

  it("throws on non-array or all-unusable payloads", () => {
    expect(() => parseDailyPapers({ nope: 1 })).toThrow(/non-array/);
    expect(() => parseDailyPapers([paper("x", "test", 1)])).toThrow(/0 usable/);
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
    const gpt5 = out.find((m) => m.id === "gpt-5")!;
    expect(gpt5).toMatchObject({
      provider: "openai",
      input: 1.25,
      output: 10,
      cachedInput: 0.125,
    });
    const opus = out.find((m) => m.id === "claude-opus-4")!;
    expect(opus).toMatchObject({ provider: "anthropic", input: 15, output: 75, cachedInput: null });
  });

  it("keeps exactly one row per model id (dupes/modes/unmatched skipped)", () => {
    const ids = parseLitellmPricing(spec)
      .map((m) => m.id)
      .sort();
    expect(ids).toEqual(["claude-opus-4", "gpt-5"]);
  });

  it("throws on non-object payloads or zero usable rows", () => {
    expect(() => parseLitellmPricing("nope")).toThrow(/non-object/);
    expect(() => parseLitellmPricing({ sample_spec: {} })).toThrow(/0 usable rows/);
  });

  it("resolves newer provider families instead of dropping them", () => {
    const out = parseLitellmPricing({
      "openai/o3": { mode: "chat", input_cost_per_token: 0.000002, output_cost_per_token: 0.000008 },
      "google/gemma-3": { mode: "chat", input_cost_per_token: 0.0000005, output_cost_per_token: 0.000001 },
      "qwen/qwen3-max": { mode: "chat", input_cost_per_token: 0.000001, output_cost_per_token: 0.000003 },
      "meta-llama/llama-4": { mode: "chat", input_cost_per_token: 0.000001, output_cost_per_token: 0.000002 },
      "xai/grok-4": { mode: "chat", input_cost_per_token: 0.000003, output_cost_per_token: 0.000015 },
    });
    const byId = new Map(out.map((m) => [m.id, m.provider]));
    expect(byId.get("o3")).toBe("openai");
    expect(byId.get("gemma-3")).toBe("google");
    expect(byId.get("qwen3-max")).toBe("qwen");
    expect(byId.get("llama-4")).toBe("meta");
    expect(byId.get("grok-4")).toBe("xai");
  });
});
