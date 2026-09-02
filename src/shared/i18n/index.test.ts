import { describe, expect, it } from "vitest";
import { createT, interpolate } from "@/shared/i18n";

describe("interpolate", () => {
  it("replaces named placeholders with provided params", () => {
    expect(interpolate("{value} min ago", { value: 5 })).toBe("5 min ago");
    expect(interpolate("{a} + {b}", { a: 1, b: "x" })).toBe("1 + x");
  });

  it("leaves placeholders untouched when their param is missing or null", () => {
    expect(interpolate("hello {name}")).toBe("hello {name}");
    expect(interpolate("hello {name}", {})).toBe("hello {name}");
    expect(interpolate("hello {name}", { name: null as unknown as string })).toBe("hello {name}");
  });

  it("returns the template as-is when no params are given", () => {
    expect(interpolate("plain {text}")).toBe("plain {text}");
  });
});

describe("createT", () => {
  it("translates with the requested language dictionary", () => {
    const zh = createT("zh");
    expect(zh("compareLimit")).toBe("请至少选择 2 个模型进行对比。");
    const en = createT("en");
    expect(en("compareLimit")).toBe("Select at least 2 models to compare.");
  });

  it("interpolates params into translated templates", () => {
    const en = createT("en");
    expect(en("timeMinutesAgo", { value: 3 })).toMatch(/^3/);
  });

  it("falls back to the key name for unknown keys", () => {
    const t = createT("zh");
    expect(t("definitelyNotAKey" as never)).toBe("definitelyNotAKey");
  });
});
