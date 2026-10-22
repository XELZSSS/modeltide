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
  it("sorts by speed and sends providers without speed data last", () => {
    const stats = useProviderStats(models, t, "speed").value;
    expect(stats.map((s) => s.name)).toEqual(["OpenAI", "Mistral", "Anthropic", "Google"]);
    expect(stats[0]!.avgSpeed).toBe(150);
  });

  it("keeps the tail order stable when several providers have no speed data", () => {
    const duplicated = useProviderStats([model("Zeta", null), model("Alpha", null), model("Beta", 10)], t, "speed");
    expect(duplicated.value.map((s) => s.name)).toEqual(["Beta", "Alpha", "Zeta"]);
  });

  it("keeps the default count ordering untouched", () => {
    const stats = useProviderStats(models, t).value;
    expect(stats[0]!.name).toBe("OpenAI");
    expect(stats[0]!.count).toBe(2);
    expect(stats).toHaveLength(4);
  });
});
