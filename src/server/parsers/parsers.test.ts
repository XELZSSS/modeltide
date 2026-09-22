import { describe, expect, it } from "vitest";
import { decodeEntities } from "@/server/parsers/html-entities";
import { stripHtml } from "@/server/parsers/html-to-text";
import { parseFeed as parseFeedResult } from "@/server/parsers/rss-feed-parser";
import { findNextData, findLongestData, parseRscPayload, parseRscPayloads } from "@/server/parsers/rsc-parser";
import { getOpenLicense } from "@/server/parsers/licenses";
import { byDateDesc, isoDate, num, numCoerce, numOr } from "@/server/parsers/parser-primitives";

/** Unwrap a successful parseFeed result; failure surfaces as a thrown error. */
function readFeed(xml: string, url = "https://x.example/feed") {
  const res = parseFeedResult(xml, url);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

const rss = (items: string) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>${items}</channel></rss>`;
const rssItem = (inner: string) => `<item>${inner}</item>`;
const atom = (entries: string) =>
  `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>T</title>${entries}</feed>`;
const atomEntry = (inner: string) => `<entry>${inner}</entry>`;
/** Line just over MAX_RSC_LINE_CHARS (2MiB) to exercise the oversized fallback. */
const oversizedLine = (inner: string) => `1:{"pad":"${"x".repeat(2 * 1024 * 1024 + 16)}",${inner}}\n`;

describe("decodeEntities", () => {
  it.each([
    ["AT&amp;T", "AT&T"],
    ["&lt;tag&gt;", "<tag>"],
    ["&#65;", "A"],
    ["&#x41;", "A"],
    ["&bogus;", "&bogus;"],
    ["&constructor;", "&constructor;"],
    ["&toString;", "&toString;"],
  ])("decodeEntities(%s) -> %s", (input, expected) => {
    expect(decodeEntities(input)).toBe(expected);
  });

  it.each([
    ["&#x110000;", ""],
    ["&#xD800;", ""],
  ])("drops invalid code points: %s", (input, expected) => {
    expect(decodeEntities(input)).toBe(expected);
  });
});

describe("stripHtml", () => {
  it.each([
    ["<p>Hello <b>world</b></p>", "Hello world"],
    ['<a title="a < b">x</a>', "x"],
    ["abc <div", "abc <div"],
    ['<script type="x" data-v="a>b">alert(1)</script>Hi', "Hi"],
    ["<style>.a{color:red}</style>Hi", "Hi"],
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

  it("prefers the shallowest match (BFS)", () => {
    const tree = { models: [{ slug: "shallow" }], nested: { models: [{ slug: "deep" }] } };
    expect(findNextData<{ slug: string }>(tree, "models")).toEqual([{ slug: "shallow" }]);
  });

  it("returns the longest array found under the key", () => {
    const tree = { a: { initialModels: [1] }, b: { initialModels: [1, 2, 3] } };
    expect(findLongestData(tree, "initialModels")).toEqual([1, 2, 3]);
  });
});

describe("parseRscPayload", () => {
  const byInitialModels = (tree: unknown) =>
    (tree as { tree?: { initialModels?: { id: string }[] } })?.tree?.initialModels ?? null;

  it("parses streamed lines with decimal and hex ids", () => {
    expect(
      parseRscPayload<{ id: string }>(
        '0:{"$a":1}\n1:{"tree":{"initialModels":[{"id":"x"}]}}\n',
        "initialModels",
        byInitialModels,
      ),
    ).toEqual([{ id: "x" }]);
    expect(
      parseRscPayload<{ id: string }>(
        '0:{"$a":1}\n2E:{"tree":{"initialModels":[{"id":"u"}]}}\n',
        "initialModels",
        byInitialModels,
      ),
    ).toEqual([{ id: "u" }]);
  });

  it('parses hex-prefixed chunk lines (Next.js flight ids are hex, e.g. "c:")', () => {
    const body =
      '0:{"$a":1}\nc:["$","$L5",null,{"models":[{"slug":"claude-opus-5"},{"slug":"gpt-5"}]}]\n1:{"ignore":true}\n';
    expect(
      parseRscPayload<{ slug: string }>(body, "models", (tree) => findNextData<{ slug: string }>(tree, "models")),
    ).toEqual([{ slug: "claude-opus-5" }, { slug: "gpt-5" }]);
  });

  it("throws when the marker is absent", () => {
    expect(() => parseRscPayload('1:{"a":1}', "missing", () => null)).toThrow(/not found/);
  });
});

describe("parseRscPayloads", () => {
  const pick = (tree: unknown) => {
    const r = tree as Record<string, { v: number }[] | undefined>;
    return r.alpha ?? r.beta ?? null;
  };

  it("resolves each marker against its own line", () => {
    const body = '1:{"alpha":[{"v":1}]}\n2:{"beta":[{"v":2}]}\n';
    expect(parseRscPayloads<{ v: number }>(body, ["alpha", "beta"], pick)).toEqual([[{ v: 1 }], [{ v: 2 }]]);
  });

  it("throws naming the marker that cannot resolve", () => {
    expect(() => parseRscPayloads('1:{"alpha":[{"v":1}]}\n', ["alpha", "missing"], pick)).toThrow(
      /"missing" not found/,
    );
  });

  it("resolves a marker behind a multi-MB sibling string via the balanced fallback", () => {
    const out = parseRscPayload<{ v: number }>(
      oversizedLine('"alpha":[{"v":1}]'),
      "alpha",
      (tree) => (tree as { alpha?: { v: number }[] }).alpha ?? null,
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

  it("falls back to the first link with an href when no alternate exists", () => {
    const items = readFeed(
      atom(
        atomEntry(
          `<title>E1</title><link rel="self" href="https://x.example/self"/><link rel="enclosure" href="https://x.example/file.mp3"/><id>e1</id>`,
        ),
      ),
    );
    expect(items[0]?.link).toBe("https://x.example/self");
  });

  it("stringifies attributed nodes via their text node", () => {
    const item = readFeed(
      rss(rssItem(`<title>I1</title><link>https://y.example/a</link><guid isPermaLink="false">guid-123</guid>`)),
      "https://y.example/feed",
    )[0];
    expect(item?.id).toBe("guid-123");
  });

  it("falls back to the link for ids when guid is absent", () => {
    expect(readFeed(rss(rssItem(`<title>A</title><link>https://y.example/a</link>`)))[0]?.id).toBe(
      "https://y.example/a",
    );
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
    // &amp; → & ; &amp;amp; → literal &amp; (single XML decode pass)
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
  it.each([
    ["", 7, 7],
    ["12.5", 0, 12.5],
  ])("numOr(%s) coerces or falls back", (input, fallback, expected) => {
    expect(numOr(input, fallback)).toBe(expected);
  });

  it("num stays strict while numCoerce accepts numeric strings", () => {
    expect(num("85.5")).toBeNull();
    expect(numCoerce("85.5")).toBe(85.5);
    expect(numCoerce("")).toBeNull();
    expect(numCoerce(true)).toBeNull();
  });

  it.each([
    ["2026-08-01", "2026-08-01"],
    ["2026-01-02T03:04:05Z", "2026-01-02T03:04:05Z"],
  ])("isoDate(%s) accepts ISO", (input, expected) => {
    expect(isoDate(input)).toBe(expected);
  });

  it.each([["Jan 1 2020"], ["2026-02-30"]])("isoDate(%s) rejects loose/impossible dates", (input) => {
    expect(isoDate(input)).toBeNull();
  });

  it("byDateDesc sinks unparseable dates and never returns a NaN comparator", () => {
    const cmp = byDateDesc<{ d: string }>((r) => r.d);
    expect(cmp({ d: "nope" }, { d: "also-nope" })).toBe(0);

    const sorted = [{ d: "2026-01-02" }, { d: "not-a-date" }, { d: "2026-03-04" }, { d: "" }].sort(cmp);
    expect(sorted.map((r) => r.d)).toEqual(["2026-03-04", "2026-01-02", "not-a-date", ""]);
  });
});

describe("getOpenLicense", () => {
  it.each([
    [["license:mit"], "mit"],
    [["license:qwen2.5"], "qwen2.5"],
    [["license:apache_2.0"], "apache-2.0"],
    [["LICENSE:MIT"], "mit"],
  ])("getOpenLicense(%j) -> %s", (tags, expected) => {
    expect(getOpenLicense(tags)).toBe(expected);
  });

  it.each([
    [["license:cc-by-nd-4.0"]],
    [["license:cc-by-nc-4.0"]],
    [["license:cc-by-nc-sa-4.0"]],
    [["license:cc-by-nc-nd-4.0"]],
    [["license:cc-by-nc4.0"]],
    [["license:mitre"]],
    [[]],
  ])("getOpenLicense(%j) rejects ND/NC/lookalikes/non-licenses", (tags) => {
    expect(getOpenLicense(tags)).toBeNull();
  });

  it("still accepts the permissive CC variants", () => {
    expect(getOpenLicense(["license:cc-by-4.0"])).toBe("cc-by-4.0");
    expect(getOpenLicense(["license:cc-by-sa-4.0"])).toBe("cc-by-sa-4.0");
  });
});

describe("feed guard", () => {
  it("rejects DOCTYPE/ENTITY bombs before parsing", () => {
    expect(parseFeedResult(`<?xml?><!DOCTYPE foo [<!ENTITY x "y">]><rss/>`, "https://x").ok).toBe(false);
  });

  it("accepts a plain entity-free DOCTYPE (legacy WordPress-style feeds)", () => {
    const items = readFeed(
      '<?xml version="1.0"?><!DOCTYPE rss><rss><channel><title>T</title><item><title>A</title><link>https://x.example/a</link></item></channel></rss>',
      "https://x",
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: "A", link: "https://x.example/a" });
  });
});
