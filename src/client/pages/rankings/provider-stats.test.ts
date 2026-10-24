import { describe, expect, it } from "vitest";
import { aaModel, t } from "@/test/fixtures";
import { useProviderStats } from "./provider-stats";

const model = (creator: string, speed: number | null) =>
  aaModel({
    model_creators: { name: creator, color: null },
    speed: speed == null ? null : { median_output_speed: speed },
  });
const models = [
  model("OpenAI", 100),
  model("OpenAI", 200),
  model("Anthropic", null),
  model("Google", null),
  model("Mistral", 50),
];

describe("useProviderStats", () => {
  it("keeps the default count ordering untouched", () => {
    const stats = useProviderStats(models, t).value;
    expect(stats[0]!.name).toBe("OpenAI");
    expect(stats[0]!.count).toBe(2);
    expect(stats).toHaveLength(4);
  });

  it("gives every provider a distinct mid-tone colour", () => {
    const stats = useProviderStats(models, t).value;
    const colors = stats.map((s) => s.color);
    expect(new Set(colors).size).toBe(colors.length);
    for (const color of colors) expect(color).toMatch(/^hsl\(/);
  });

  it("replaces near-black brand colours with readable, distinct hues", () => {
    const blackBrand = (creator: string) => aaModel({ model_creators: { name: creator, color: "#000000" } });
    const stats = useProviderStats([blackBrand("OpenAI"), blackBrand("Liquid AI")], t).value;
    expect(stats.map((s) => s.color)).not.toContain("#000000");
    expect(new Set(stats.map((s) => s.color)).size).toBe(2);
  });
});
