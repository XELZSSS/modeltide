import { describe, expect, it } from "vitest";
import { parseStatuspageSummary, parseGoogleCloudIncidents } from "@/server/sources/provider-status";
import { parseDailyPapers } from "@/server/sources/hf-papers";
import { parseLitellmPricing } from "@/server/sources/pricing/litellm";

describe("parseStatuspageSummary", () => {
  it("is healthy when every component is operational", () => {
    const out = parseStatuspageSummary({
      components: [
        { name: "API", status: "operational" },
        { name: "Chat", status: "operational" },
      ],
    });
    expect(out).toMatchObject({ ok: true, total: 2 });
  });

  it("fails when any component is degraded/partial/major", () => {
    const out = parseStatuspageSummary({
      components: [
        { name: "API", status: "operational" },
        { name: "Images", status: "degraded_performance" },
        { name: "", status: "partial_outage" },
      ],
    });
    expect(out.ok).toBe(false);
    expect(out.degradedComponents).toEqual(["Images", "partial_outage"]);
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
    expect(out).toMatchObject({ ok: true, openIncidents: [] });
  });

  it("reports open incidents above routine severity", () => {
    const out = parseGoogleCloudIncidents([
      { external_desc: "Closed", end: "2026-09-01T18:52:00+00:00", severity: "high" },
      { external_desc: "Open outage", end: null, severity: "high" },
      { external_desc: "Routine", end: null, severity: "low" },
    ]);
    expect(out.ok).toBe(false);
    expect(out.openIncidents).toEqual(["Open outage"]);
  });

  it("treats an open incident without severity as failing", () => {
    const out = parseGoogleCloudIncidents([{ external_desc: "Mystery", end: null }]);
    expect(out.ok).toBe(false);
    expect(out.openIncidents).toEqual(["Mystery"]);
  });

  it("throws on a non-array payload", () => {
    expect(() => parseGoogleCloudIncidents({ nope: true })).toThrow(/non-array/);
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

  it("caps at 30 items", () => {
    const many = Array.from({ length: 40 }, (_, i) => paper(`id-${i}`, `Paper ${i}`, 100 - i));
    expect(parseDailyPapers(many)).toHaveLength(30);
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
      contextWindow: 400000,
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
});
