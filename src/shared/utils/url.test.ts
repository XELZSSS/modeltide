import { describe, expect, it } from "vitest";
import { isHttpUrl, isInternalHref, safeHref } from "./url";

describe("isHttpUrl", () => {
  it.each([
    ["https://example.com/a", true],
    ["http://example.com", true],
    ["  https://example.com  ", true],
    ["ftp://example.com", false],
    ["javascript:alert(1)", false],
    ["//example.com", false],
    ["", false],
  ])("%s -> %s", (link, expected) => {
    expect(isHttpUrl(link)).toBe(expected);
  });
});

describe("safeHref", () => {
  it("passes an internal path through unchanged", () => {
    expect(safeHref("/models?tab=openRouterRankings")).toBe("/models?tab=openRouterRankings");
  });

  it("keeps absolute http(s) links", () => {
    expect(safeHref("https://example.com/a")).toBe("https://example.com/a");
  });

  it("rejects protocol-relative and backslash-relative targets", () => {
    expect(safeHref("//evil.example")).toBeUndefined();
    expect(safeHref("/\\evil.example")).toBeUndefined();
  });

  it("rejects non-http schemes and blank input", () => {
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(safeHref("data:text/html,<script>")).toBeUndefined();
    expect(safeHref("")).toBeUndefined();
    expect(safeHref(null)).toBeUndefined();
    expect(safeHref(undefined)).toBeUndefined();
  });

  it("strips control characters before deciding", () => {
    expect(safeHref("https://example.com/\u0000path")).toBe("https://example.com/path");
    expect(safeHref("\u0000")).toBeUndefined();
  });
});

describe("isInternalHref", () => {
  const origin = "https://example.com";

  it("accepts a path on the same origin", () => {
    expect(isInternalHref("/models", origin)).toBe(true);
  });

  it("rejects fragments, empties and other origins", () => {
    expect(isInternalHref("#top", origin)).toBe(false);
    expect(isInternalHref("", origin)).toBe(false);
    expect(isInternalHref("https://other.example/a", origin)).toBe(false);
    expect(isInternalHref("//other.example/a", origin)).toBe(false);
  });
});
