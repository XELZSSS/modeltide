import { describe, expect, it } from "vitest";
import { decodeEntities } from "./html-entities";
import { stripHtml } from "./html-to-text";
import { parseFeed as parseFeedResult } from "./rss-feed-parser";
import { findNextData, findLongestData, parseRscPayload, parseRscPayloads } from "./rsc-parser";
import { isMarkerBoundaryAt } from "./rsc-text";
import { getOpenLicenseId, licenseTagId } from "./licenses";
import { sortByDateDesc, isoDate, numCoerce } from "./parser-primitives";

function readFeed(xml: string, url = "https://x.example/feed") {
  const res = parseFeedResult(xml, url);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

function unwrap<T>(res: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

const rss = (items: string) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>${items}</channel></rss>`;
const rssItem = (inner: string) => `<item>${inner}</item>`;
const atom = (entries: string) =>
  `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>T</title>${entries}</feed>`;
const atomEntry = (inner: string) => `<entry>${inner}</entry>`;
const oversizedLine = (inner: string) => `1:{"pad":"${"x".repeat(2 * 1024 * 1024 + 16)}",${inner}}\n`;

describe("decodeEntities", () => {
  it.each([
    ["AT&amp;T", "AT&T"],
    ["&lt;tag&gt;", "<tag>"],
    ["&#x41;", "A"],
    ["&bogus;", "&bogus;"],
    ["&constructor;", "&constructor;"],
  ])("decodeEntities(%s) -> %s", (input, expected) => {
    expect(decodeEntities(input)).toBe(expected);
  });
});

describe("stripHtml", () => {
  it.each([
    ["<p>Hello <b>world</b></p>", "Hello world"],
    ['<script type="x" data-v="a>b">alert(1)</script>Hi', "Hi"],
    ["<title><![CDATA[A<B]]></title>", "A<B"],
  ])("stripHtml(%s) -> %s", (input, expected) => {
    expect(stripHtml(input)).toBe(expected);
  });
});

describe("findNextData / findLongestData", () => {
  it("finds the first array under a key in a nested tree", () => {
    expect(findNextData({ leaderboard: { entries: [{ rank: 1 }] } }, "entries")).toEqual([{ rank: 1 }]);
  });

  it("returns null when the key is absent", () => {
    expect(findNextData({ other: [1] }, "entries")).toBeNull();
    expect(findLongestData({}, "initialModels")).toBeNull();
  });

  it("returns the longest array found under the key", () => {
    const tree = { a: { initialModels: [1] }, b: { initialModels: [1, 2, 3] } };
    expect(findLongestData(tree, "initialModels")).toEqual([1, 2, 3]);
  });
});

describe("isMarkerBoundaryAt", () => {
  const boundary = (line: string, marker: string): boolean => isMarkerBoundaryAt(line, `"${marker}"`);
  const WHITESPACE = [
    " ",
    "\t",
    "\u00a0",
    "\u1680",
    "\u2000",
    "\u200a",
    "\u2028",
    "\u2029",
    "\u202f",
    "\u205f",
    "\u3000",
    "\ufeff",
  ];

  it("treats every character trimStart skips as whitespace", () => {
    for (const ws of WHITESPACE) {
      expect(boundary(`{"m"${ws}:[]}`, "m")).toBe(true);
    }
    expect(boundary('{"m"\u00b7:[]}', "m")).toBe(false);
  });
});

describe("parseRscPayload", () => {
  const byInitialModels = (tree: unknown) =>
    (tree as { tree?: { initialModels?: { id: string }[] } })?.tree?.initialModels ?? null;

  it("parses streamed lines with decimal and hex ids", () => {
    expect(
      unwrap(
        parseRscPayload<{ id: string }>(
          '0:{"$a":1}\n1:{"tree":{"initialModels":[{"id":"x"}]}}\n',
          "initialModels",
          byInitialModels,
        ),
      ),
    ).toEqual([{ id: "x" }]);
    expect(
      unwrap(
        parseRscPayload<{ id: string }>(
          '0:{"$a":1}\n2E:{"tree":{"initialModels":[{"id":"u"}]}}\n',
          "initialModels",
          byInitialModels,
        ),
      ),
    ).toEqual([{ id: "u" }]);
  });

  it("parses hex-prefixed chunk lines (Next.js flight ids are hex, e.g. c:)", () => {
    const body =
      '0:{"$a":1}\nc:["$","$L5",null,{"models":[{"slug":"claude-opus-5"},{"slug":"gpt-5"}]}]\n1:{"ignore":true}\n';
    expect(
      unwrap(
        parseRscPayload<{ slug: string }>(body, "models", (tree) => findNextData<{ slug: string }>(tree, "models")),
      ),
    ).toEqual([{ slug: "claude-opus-5" }, { slug: "gpt-5" }]);
  });
});

describe("parseRscPayloads", () => {
  const pick = (tree: unknown) => {
    const r = tree as Record<string, { v: number }[] | undefined>;
    return r.alpha ?? r.beta ?? null;
  };

  it("resolves each marker against its own line", () => {
    const body = '1:{"alpha":[{"v":1}]}\n2:{"beta":[{"v":2}]}\n';
    expect(unwrap(parseRscPayloads<{ v: number }>(body, ["alpha", "beta"], pick))).toEqual([[{ v: 1 }], [{ v: 2 }]]);
  });

  it("throws naming the marker that cannot resolve", () => {
    expect(() => unwrap(parseRscPayloads('1:{"alpha":[{"v":1}]}\n', ["alpha", "missing"], pick))).toThrow(
      /"missing" not found/,
    );
  });

  it("resolves a marker behind a multi-MB sibling string via the balanced fallback", () => {
    const out = unwrap(
      parseRscPayload<{ v: number }>(
        oversizedLine('"alpha":[{"v":1}]'),
        "alpha",
        (tree) => (tree as { alpha?: { v: number }[] }).alpha ?? null,
      ),
    );
    expect(out).toEqual([{ v: 1 }]);
  });
});

describe("parseFeed", () => {
  it("extracts the alternate link when an Atom entry has multiple links", () => {
    const items = readFeed(
      atom(
        atomEntry(
          `<title>E1</title><link rel="self" href="https://x.example/self"/><link rel="alternate" type="text/html" href="https://x.example/post-1"/><id>e1</id><updated>2026-08-01T00:00:00Z</updated>`,
        ),
      ),
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.link).toBe("https://x.example/post-1");
  });

  it("drops entries that expose no usable link", () => {
    const items = readFeed(
      rss(rssItem(`<title>Only Title</title>`) + rssItem(`<title>Keep</title><link>https://y.example/keep</link>`)),
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("Keep");
  });

  it("returns a failure result on garbage feeds instead of throwing", () => {
    const res = parseFeedResult("not xml at all <>>>", "https://y.example/feed");
    expect(res.ok).toBe(false);
    expect(res.ok ? "" : res.error).toMatch(/Unrecognized|Unparseable/);
  });

  it("decodes XML entities in links once (processEntities is off)", () => {
    const items = readFeed(rss(rssItem(`<title>A</title><link>https://y.example/a?b=1&amp;c=2&amp;amp;d=3</link>`)));
    expect(items[0]?.link).toBe("https://y.example/a?b=1&c=2&amp;d=3");
  });

  it("strips HTML and truncates abusive titles", () => {
    const longTitle = `A${"x".repeat(500)}`;
    const items = readFeed(
      rss(rssItem(`<title><![CDATA[<p>${longTitle}</p>]]></title><link>https://y.example/a</link>`)),
    );
    expect(items[0]?.title.length).toBeLessThanOrEqual(300);
  });

  it("strips tags decoded from entities instead of rendering them", () => {
    const xml = rss(
      rssItem(`<title>&lt;script&gt;alert(1)&lt;/script&gt;Real News</title><link>https://y.example/a</link>`),
    );
    expect(readFeed(xml)[0]?.title).toBe("Real News");
  });
});

describe("primitives", () => {
  it("numCoerce accepts numeric strings and rejects non-numeric input", () => {
    expect(numCoerce("85.5")).toBe(85.5);
    expect(numCoerce(85.5)).toBe(85.5);
    expect(numCoerce("")).toBeNull();
    expect(numCoerce(true)).toBeNull();
    expect(numCoerce(Number.NaN)).toBeNull();
  });

  it.each([["Jan 1 2020"], ["2026-02-30"]])("isoDate(%s) rejects loose/impossible dates", (input) => {
    expect(isoDate(input)).toBeNull();
  });

  it("sortByDateDesc sinks unparseable dates and never returns a NaN ordering", () => {
    const sorted = sortByDateDesc(
      [{ d: "2026-01-02" }, { d: "not-a-date" }, { d: "2026-03-04" }, { d: "" }],
      (r) => r.d,
    );
    expect(sorted.map((r) => r.d)).toEqual(["2026-03-04", "2026-01-02", "not-a-date", ""]);
  });
});

describe("getOpenLicenseId", () => {
  const licenseOf = (tags: string[]): string | null =>
    getOpenLicenseId(tags.map(licenseTagId).filter((id): id is string => id != null));

  it.each([
    [["license:mit"], "mit"],
    [["license:apache_2.0"], "apache-2.0"],
    [["LICENSE:MIT"], "mit"],
  ])("licenseOf(%j) -> %s", (tags, expected) => {
    expect(licenseOf(tags)).toBe(expected);
  });

  it.each([[["license:cc-by-nd-4.0"]], [["license:cc-by-nc-4.0"]], [["license:mitre"]], [[]]])(
    "licenseOf(%j) rejects ND/NC/lookalikes/non-licenses",
    (tags) => {
      expect(licenseOf(tags)).toBeNull();
    },
  );
});

describe("feed guard", () => {
  it("rejects DOCTYPE/ENTITY bombs before parsing", () => {
    expect(parseFeedResult(`<?xml?><!DOCTYPE foo [<!ENTITY x "y">]><rss/>`, "https://x").ok).toBe(false);
  });
});
