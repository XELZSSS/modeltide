import { describe, expect, it } from "vitest";
import { decodeEntities } from "@/server/parsers/entities";
import { stripHtml } from "@/server/parsers/html";
import { parseFeed as parseFeedResult } from "@/server/parsers/feed";
import {
  balancedJsonEnd,
  findNextData,
  findLongestData,
  parseRscPayload,
  parseRscPayloads,
} from "@/server/parsers/rsc";
import { getOpenLicense } from "@/server/parsers/licenses";
import {
  isoDate,
  num,
  numCoerce,
  numIntNonNegative,
  numNonNegative,
  numOr,
  numPositive,
} from "@/server/parsers/primitives";

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
    ["&rarr;", "→"],
    ["&check;", "✓"],
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
    ["Hello<!-- hidden -->World", "HelloWorld"],
    ["<p>Hello</p><p>World</p>", "Hello World"],
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

  it.each([
    ['0:{"$a":1}\n1:{"tree":{"initialModels":[{"id":"x"}]}}\n', [{ id: "x" }]],
    ['0:{"$a":1}\n2E:{"tree":{"initialModels":[{"id":"u"}]}}\n', [{ id: "u" }]],
    ['0:{"note":"initialModels are great"}\n1:{"tree":{"initialModels":[{"id":"y"}]}}\n', [{ id: "y" }]],
  ])("parses streamed lines, hex ids, and prose mentions", (body, expected) => {
    expect(parseRscPayload<{ id: string }>(body, "initialModels", byInitialModels)).toEqual(expected);
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

  it("resolves two markers riding the same line (shared parse)", () => {
    const body = '1:{"alpha":[{"v":1}],"beta":[{"v":2}]}\n';
    const out = parseRscPayloads<{ v: number }>(body, ["alpha", "beta"], pick);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual([{ v: 1 }]);
    expect(out[1]).toEqual([{ v: 1 }]);
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

  it("gives up bounded when the oversized marker value is truncated mid-value", () => {
    const body = oversizedLine('"alpha":[{"v":1}').slice(0, -2);
    expect(() =>
      parseRscPayload<{ v: number }>(body, "alpha", (tree) => (tree as { alpha?: { v: number }[] }).alpha ?? null),
    ).toThrow(/not found/);
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

  it.each([
    [
      rss(rssItem(`<title>I1</title><link>https://y.example/a</link><guid isPermaLink="false">guid-123</guid>`)),
      "guid-123",
      undefined,
    ],
    [
      atom(
        atomEntry(
          `<title type="text">Real Title</title><link rel="alternate" href="https://x.example/p1"/><id>e1</id>`,
        ),
      ),
      "e1",
      "Real Title",
    ],
  ])("stringifies attributed nodes via their text node", (xml, expectedId, expectedTitle) => {
    const item = readFeed(xml, "https://y.example/feed")[0];
    expect(item?.id).toBe(expectedId);
    if (expectedTitle !== undefined) expect(item?.title).toBe(expectedTitle);
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

  it("keeps valid items sitting beyond the first 50 raw entries", () => {
    const junk = Array.from({ length: 55 }, (_, i) => `<item><title>J${i}</title></item>`).join("");
    const items = readFeed(
      `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>${junk}<item><title>Real</title><link>https://y.example/real</link></item></channel></rss>`,
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("Real");
  });

  it("returns a failure result on garbage feeds instead of throwing", () => {
    const res = parseFeedResult("not xml at all <>>>", "https://y.example/feed");
    expect(res.ok).toBe(false);
    expect(res.ok ? "" : res.error).toMatch(/Unrecognized|Unparseable/);
  });

  it("trims whitespace links and supports numeric guid", () => {
    const items = readFeed(rss(rssItem(`<title>N</title><link>  https://y.example/spaced  </link><guid>12345</guid>`)));
    expect(items[0]?.link).toBe("https://y.example/spaced");
    expect(items[0]?.id).toBe("12345");
  });

  it("decodes XML entities in links once (processEntities is off)", () => {
    const items = readFeed(rss(rssItem(`<title>A</title><link>https://y.example/a?b=1&amp;c=2&amp;amp;d=3</link>`)));
    // &amp; → & ; &amp;amp; → literal &amp; (single XML decode pass)
    expect(items[0]?.link).toBe("https://y.example/a?b=1&c=2&amp;d=3");
  });

  it("decodes entities in Atom link href attributes", () => {
    const items = readFeed(
      atom(atomEntry(`<title>A</title><link rel="alternate" href="https://x.example/p?ref=rss&amp;utm=x"/>`)),
    );
    expect(items[0]?.link).toBe("https://x.example/p?ref=rss&utm=x");
  });

  it("takes the first value when a title element is repeated", () => {
    const items = readFeed(rss(rssItem(`<title>First</title><title>Second</title><link>https://y.example/dup</link>`)));
    expect(items[0]?.title).toBe("First");
  });

  it("falls back to a later link when the alternate link has no href", () => {
    const items = readFeed(
      rss(rssItem(`<title>A</title><link rel="alternate"/><link>https://y.example/fallback</link>`)),
    );
    expect(items[0]?.link).toBe("https://y.example/fallback");
  });

  it("does not split surrogate pairs when truncating long titles", () => {
    const longTitle = `A${"😀".repeat(200)}`; // 401 UTF-16 units
    const t =
      readFeed(rss(rssItem(`<title>${longTitle}</title><link>https://y.example/surrogate</link>`)))[0]?.title ?? "";
    expect(t.length).toBeLessThanOrEqual(300);
    // 'A' + 149 complete emoji = 150 code points; the dangling high surrogate
    // at the old cut point is dropped instead of left invalid.
    expect([...t].length).toBe(150);
    expect(t.length).toBe(299);
    const last = t.charCodeAt(t.length - 1)!;
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false); // never ends mid-pair
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
    ["   ", 7, 7],
    ["12.5", 0, 12.5],
  ])("numOr(%s) coerces or falls back", (input, fallback, expected) => {
    expect(numOr(input, fallback)).toBe(expected);
  });

  it("numOr never throws on non-string input", () => {
    expect(numOr(Symbol("x") as unknown as string, 3)).toBe(3);
    expect(numOr(NaN, 3)).toBe(3);
    expect(numOr(Infinity, 3)).toBe(3);
  });

  it("num stays strict while numCoerce accepts numeric strings", () => {
    expect(num("85.5")).toBeNull();
    expect(numCoerce("85.5")).toBe(85.5);
    expect(numCoerce("")).toBeNull();
    expect(numCoerce(true)).toBeNull();
  });

  it.each([
    ["2026-08-01", "2026-08-01"],
    ["  2026-08-01T00:00:00Z  ", "2026-08-01T00:00:00Z"],
    ["2026-01-02T03:04:05Z", "2026-01-02T03:04:05Z"],
  ])("isoDate(%s) accepts ISO", (input, expected) => {
    expect(isoDate(input)).toBe(expected);
  });

  it.each([["Jan 1 2020"], ["2020/01/01"], ["2026-02-30"]])("isoDate(%s) rejects loose/impossible dates", (input) => {
    expect(isoDate(input)).toBeNull();
  });

  it("numPositive/numNonNegative/numIntNonNegative behave", () => {
    expect(numPositive(0)).toBeNull();
    expect(numNonNegative(0)).toBe(0);
    expect(numIntNonNegative(3.9)).toBe(3);
    expect(numIntNonNegative(-1)).toBeNull();
  });
});

describe("getOpenLicense", () => {
  it.each([
    [["license:mit"], "mit"],
    [["license:llama4"], "llama4"],
    [["license:qwen2.5"], "qwen2.5"],
    [["license:cc-by-nc-4.0"], "cc-by-nc-4.0"],
    [["license:apache_2.0"], "apache-2.0"],
    [["license:mistral"], "mistral"],
    [["license:other", "license:phi-2"], "phi-2"],
    [["LICENSE:MIT"], "mit"],
  ])("getOpenLicense(%j) -> %s", (tags, expected) => {
    expect(getOpenLicense(tags)).toBe(expected);
  });

  it.each([
    [["license:cc-by-nd-4.0"]],
    [["license:cc-by-nc-nd-4.0"]],
    [["license:mitre"]],
    [["other", "license:other"]],
    [[]],
  ])("getOpenLicense(%j) rejects ND/lookalikes/non-licenses", (tags) => {
    expect(getOpenLicense(tags)).toBeNull();
  });
});

describe("balancedJsonEnd", () => {
  it.each([
    ['[{"a":[1,2]}]', 0, 100, 13],
    ['{"a":1} tail', 0, 100, 7],
    ['{"a":"]"}', 0, 100, 9],
    ['{"a":"\\""}', 0, 100, 10],
  ])("finds the matching close (%s)", (text, openIdx, budget, expected) => {
    expect(balancedJsonEnd(text, openIdx, budget)).toBe(expected);
  });

  it.each([
    ["[1,2", 0, 100],
    ["[1,2,3]", 0, 4],
    ["abc", 1, 100],
    ["[1]", 0, 0],
  ])("fails closed on truncation/budget/non-bracket starts", (text, openIdx, budget) => {
    expect(balancedJsonEnd(text, openIdx, budget)).toBe(-1);
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
