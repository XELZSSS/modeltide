import { describe, expect, it } from "vitest";
import { decodeEntities } from "./html-entities";
import { stripHtml } from "./html-to-text";
import { parseFeed as parseFeedResult, capItems } from "./rss-feed-parser";
import { findNextData, findLongestData } from "./rsc-data";
import { parseRscPayload, parseRscPayloads } from "./rsc-parser";
import { findMarkerValue } from "./rsc-text";
import { getOpenLicenseId, licenseTagId } from "./licenses";
import { sortByDateDesc, isoDate } from "./dates";
import { numCoerce } from "./scalars";

function unwrap<T>(res: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

function readFeed(xml: string, url = "https://x.example/feed") {
  return unwrap(parseFeedResult(xml, url));
}

const rss = (items: string) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>${items}</channel></rss>`;
const rssItem = (inner: string) => `<item>${inner}</item>`;
const rssFeed = (...inners: string[]) => rss(inners.map(rssItem).join(""));
const atom = (entries: string) =>
  `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>T</title>${entries}</feed>`;
const atomEntry = (inner: string) => `<entry>${inner}</entry>`;

describe("capItems", () => {
  const manyItems = (count: number) =>
    Array.from({ length: count }, (_, i) => `<item><title>t${i}</title></item>`).join("");

  it.each([
    ["keeps the first `keep` items and reuses the document's own tail", rss(manyItems(200)), "</channel></rss>"],
    // Namespaced tags, a comment between the closers and CRLF are shapes a literal tail list would miss, and an
    // un-capped feed is the 19 ms of a 10 ms CPU budget this function exists to prevent.
    [
      "caps a namespaced container with a comment and CRLF tail",
      `<rss:rss><rss:channel><title>T</title>${manyItems(200)}</rss:channel>\r\n<!--f--></rss:rss>`,
      "\r\n<!--f--></rss:rss>",
    ],
  ])("%s", (_label, xml, tail) => {
    const capped = capItems(xml, 120);
    expect(capped.split("</item>")).toHaveLength(121);
    expect(capped.endsWith(tail)).toBe(true);
  });

  it("does not count a closer carried inside a CDATA body", () => {
    // The 50 closers inside the CDATA are HTML in a description, not items: counting them would put the cut inside the
    // first item and leave the document malformed.
    const body = `<item><description><![CDATA[${manyItems(50)}]]></description></item>`;
    const capped = capItems(rss(body + manyItems(200)), 120);
    expect(capped).toContain("<title>t118</title>");
    expect(capped).not.toContain("<title>t119</title>");
    expect(capped.endsWith("</channel></rss>")).toBe(true);
  });

  it.each([
    ["a document with no tail after its last item", `<rss><channel><title>T</title>${manyItems(200)}`],
    ["a feed carrying no more than `keep` items", rss(manyItems(5))],
  ])("leaves %s untouched", (_label, xml) => {
    expect(capItems(xml, 120)).toBe(xml);
  });
});

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
  const LOOKUPS: [string, () => unknown, unknown][] = [
    [
      "finds the first array under a key in a nested tree",
      () => findNextData({ leaderboard: { entries: [{ rank: 1 }] } }, "entries"),
      [{ rank: 1 }],
    ],
    [
      "returns the longest array found under the key",
      () => findLongestData({ a: { initialModels: [1] }, b: { initialModels: [1, 2, 3] } }, "initialModels"),
      [1, 2, 3],
    ],
  ];

  it.each(LOOKUPS)("%s", (_label, run, expected) => {
    expect(run()).toEqual(expected);
  });

  it("returns null when the key is absent", () => {
    expect(findNextData({ other: [1] }, "entries")).toBeNull();
    expect(findLongestData({}, "initialModels")).toBeNull();
  });
});

describe("findMarkerValue", () => {
  const valueAt = (line: string, marker: string): number | null => findMarkerValue(line, `"${marker}"`);
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

  it.each(WHITESPACE)("treats %j as the whitespace trimStart skips around the colon", (ws) => {
    expect(valueAt(`{"m"${ws}:[]}`, "m")).not.toBeNull();
    expect(valueAt(`{"m":${ws}[]}`, "m")).not.toBeNull();
  });

  it("rejects a character trimStart does not skip and a key that only mentions the marker", () => {
    expect(valueAt('{"m"\u00b7:[]}', "m")).toBeNull();
    expect(valueAt('{"x":["m"]}', "m")).toBeNull();
  });

  it("returns the value position of the first pair whose key carries a value", () => {
    const line = '{"z":1,"m" : [42]}';
    expect(line[valueAt(line, "m")!]).toBe("[");
    expect(valueAt('{"other":["m"]}', "missing")).toBeNull();
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
      '0:{"$a":1}\nc:["$","$L5",null,{"models":[{"slug":"claude-opus-5-5"},{"slug":"gpt-6-1-sol"}]}]\n1:{"ignore":true}\n';
    expect(
      unwrap(
        parseRscPayload<{ slug: string }>(body, "models", (tree) => findNextData<{ slug: string }>(tree, "models")),
      ),
    ).toEqual([{ slug: "claude-opus-5-5" }, { slug: "gpt-6-1-sol" }]);
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

  it("resolves the marker on a real AA line: one long JSON line with sibling keys carrying the same text", () => {
    // The shape a live AA leaderboard body takes (verified against a real 643 KB payload): the whole page arrives as one
    // ~380 KB JSON stream line, `initialModels` sits deep inside a `["$","div",null,{…}]` node, and the marker text also
    // appears in earlier sibling keys that hold no array. The parser has to pick the array, not the first occurrence.
    const rows = [
      { slug: "m0", url: "https://example.com/a" },
      { slug: "m1", url: "https://example.com/b" },
    ];
    const node = [
      "$",
      "div",
      null,
      { className: "container", nav: { initialModels: { children: [] } }, initialModels: rows },
    ];
    const body = `e:${JSON.stringify(node)}\n`;

    expect(
      unwrap(
        parseRscPayload<{ slug: string }>(body, "initialModels", (tree) =>
          findNextData<{ slug: string }>(tree, "initialModels"),
        ),
      ),
    ).toEqual(rows);
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
      rssFeed(`<title>Only Title</title>`, `<title>Keep</title><link>https://y.example/keep</link>`),
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
    const items = readFeed(rssFeed(`<title>A</title><link>https://y.example/a?b=1&amp;c=2&amp;amp;d=3</link>`));
    expect(items[0]?.link).toBe("https://y.example/a?b=1&c=2&amp;d=3");
  });

  it("strips HTML and truncates abusive titles", () => {
    const longTitle = `A${"x".repeat(500)}`;
    const items = readFeed(rssFeed(`<title><![CDATA[<p>${longTitle}</p>]]></title><link>https://y.example/a</link>`));
    expect(items[0]?.title.length).toBeLessThanOrEqual(300);
  });

  it("strips tags decoded from entities instead of rendering them", () => {
    const xml = rssFeed(
      `<title>&lt;script&gt;alert(1)&lt;/script&gt;Real News</title><link>https://y.example/a</link>`,
    );
    expect(readFeed(xml)[0]?.title).toBe("Real News");
  });
});

describe("primitives", () => {
  it.each<[string, unknown, unknown]>([
    ["a numeric string", "85.5", 85.5],
    ["a number", 85.5, 85.5],
    ["an empty string", "", null],
    ["a boolean", true, null],
    ["NaN", Number.NaN, null],
  ])("numCoerce: %s", (_label, input, expected) => {
    expect(numCoerce(input)).toBe(expected);
  });

  it("isoDate rejects loose date shapes", () => {
    expect(isoDate("Jan 1 2020")).toBeNull();
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
  it("does not expand entities and rejects documents that are not feeds", () => {
    expect(parseFeedResult(`<?xml?><!DOCTYPE foo [<!ENTITY x "y">]><rss/>`, "https://x").ok).toBe(false);
  });
});
