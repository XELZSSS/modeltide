import { describe, expect, it } from "vitest";
import { isHttpUrl, isInternalHref, safeHref } from "./url";

/** A scheme that is never a link the app may render, so it stands in for every rejected scheme below. */
const JS_URL = "javascript:alert(1)";

describe("isHttpUrl", () => {
  it.each([
    ["https://example.com/a", true],
    ["http://example.com", true],
    ["  https://example.com  ", true],
    ["ftp://example.com", false],
    [JS_URL, false],
    ["//example.com", false],
    ["", false],
  ])("%s -> %s", (link, expected) => {
    expect(isHttpUrl(link)).toBe(expected);
  });
});

describe("safeHref", () => {
  it.each(["/models?tab=openRouterRankings", "https://example.com/a"])("passes the usable href %s through", (href) => {
    expect(safeHref(href)).toBe(href);
  });

  it.each(["//evil.example", "/\\evil.example", JS_URL, "data:text/html,<script>", "", null, undefined])(
    "rejects the protocol-relative, non-http or blank target %s",
    (href) => {
      expect(safeHref(href)).toBeUndefined();
    },
  );

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

  it.each(["#top", "", "https://other.example/a", "//other.example/a"])(
    "rejects %s as a path on the origin",
    (href) => {
      expect(isInternalHref(href, origin)).toBe(false);
    },
  );
});
