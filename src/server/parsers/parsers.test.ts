import { describe, expect, it } from "vitest";
import { decodeEntities } from "@/server/parsers/entities";
import { stripHtml } from "@/server/parsers/html";
import { parseFeed } from "@/server/parsers/feed";
import { findNextData, parseRscPayload, parseRscPayloads } from "@/server/parsers/rsc";
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

describe("decodeEntities", () => {
  it("decodes named entities", () => {
    expect(decodeEntities("AT&amp;T")).toBe("AT&T");
    expect(decodeEntities("&lt;tag&gt;")).toBe("<tag>");
  });
  it("decodes decimal and hex references", () => {
    expect(decodeEntities("&#65;")).toBe("A");
    expect(decodeEntities("&#x41;")).toBe("A");
  });
  it("leaves unknown entities untouched", () => {
    expect(decodeEntities("&bogus;")).toBe("&bogus;");
  });
  it("passes prototype-named entities through untouched", () => {
    expect(decodeEntities("&constructor;")).toBe("&constructor;");
    expect(decodeEntities("&toString;")).toBe("&toString;");
  });
  it("rejects out-of-range code points", () => {
    expect(decodeEntities("&#x110000;")).toBe("");
  });
  it("decodes new arrow/symbol entities and drops surrogates silently", () => {
    expect(decodeEntities("&rarr;")).toBe("→");
    expect(decodeEntities("&check;")).toBe("✓");
    expect(decodeEntities("&#xD800;")).toBe("");
  });
});

describe("stripHtml", () => {
  it("removes tags and keeps text", () => {
    expect(stripHtml("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });
  it("ignores angle brackets inside quoted attributes", () => {
    expect(stripHtml('<a title="a < b">x</a>')).toBe("x");
  });
  it("handles unterminated tags", () => {
    expect(stripHtml("abc <div")).toBe("abc <div");
  });
  it("skips comments and keeps surrounding text separated by collapse", () => {
    expect(stripHtml("Hello<!-- hidden -->World")).toBe("HelloWorld");
    expect(stripHtml("<p>Hello</p><p>World</p>")).toBe("Hello World");
  });
  it("drops script content even when attributes contain >", () => {
    expect(stripHtml('<script type="x" data-v="a>b">alert(1)</script>Hi')).toBe("Hi");
    expect(stripHtml("<style>.a{color:red}</style>Hi")).toBe("Hi");
  });
  it("keeps CDATA inner text", () => {
    expect(stripHtml("<title><![CDATA[A<B]]></title>")).toBe("A<B");
  });
});

describe("findNextData", () => {
  it("finds the first array under a key in a nested tree", () => {
    const tree = { leaderboard: { entries: [{ rank: 1 }] } };
    expect(findNextData(tree, "entries")).toEqual([{ rank: 1 }]);
  });

  it("returns null when the key is absent", () => {
    expect(findNextData({ other: [1] }, "entries")).toBeNull();
  });

  it("prefers the shallowest match (BFS)", () => {
    const tree = { models: [{ slug: "shallow" }], nested: { models: [{ slug: "deep" }] } };
    expect(findNextData<{ slug: string }>(tree, "models")).toEqual([{ slug: "shallow" }]);
  });
});

describe("parseRscPayload", () => {
  it("parses streamed RSC lines and applies the extractor", () => {
    const body = '0:{"$a":1}\n1:{"tree":{"initialModels":[{"id":"x"}]}}\n';
    const out = parseRscPayload<{ id: string }>(
      body,
      "initialModels",
      (tree) => (tree as { tree?: { initialModels?: { id: string }[] } })?.tree?.initialModels ?? null,
    );
    expect(out).toEqual([{ id: "x" }]);
  });

  it('parses hex-prefixed chunk lines (Next.js flight ids are hex, e.g. "c:")', () => {
    const body =
      '0:{"$a":1}\nc:["$","$L5",null,{"models":[{"slug":"claude-opus-5"},{"slug":"gpt-5"}]}]\n1:{"ignore":true}\n';
    const out = parseRscPayload<{ slug: string }>(body, "models", (tree) =>
      findNextData<{ slug: string }>(tree, "models"),
    );
    expect(out).toEqual([{ slug: "claude-opus-5" }, { slug: "gpt-5" }]);
  });

  it("throws when the marker is absent", () => {
    expect(() => parseRscPayload('1:{"a":1}', "missing", () => null)).toThrow(/not found/);
  });

  it("parses uppercase hex chunk ids", () => {
    const body = '0:{"$a":1}\n2E:{"tree":{"initialModels":[{"id":"u"}]}}\n';
    const out = parseRscPayload<{ id: string }>(
      body,
      "initialModels",
      (tree) => (tree as { tree?: { initialModels?: { id: string }[] } })?.tree?.initialModels ?? null,
    );
    expect(out).toEqual([{ id: "u" }]);
  });

  it("ignores prose lines that merely mention the marker", () => {
    const body = '0:{"note":"initialModels are great"}\n1:{"tree":{"initialModels":[{"id":"y"}]}}\n';
    const out = parseRscPayload<{ id: string }>(
      body,
      "initialModels",
      (tree) => (tree as { tree?: { initialModels?: { id: string }[] } })?.tree?.initialModels ?? null,
    );
    expect(out).toEqual([{ id: "y" }]);
  });
});

describe("parseRscPayloads", () => {
  const pick = (tree: unknown) => {
    const r = tree as Record<string, { v: number }[] | undefined>;
    return r.alpha ?? r.beta ?? null;
  };

  it("resolves each marker against its own line", () => {
    const body = '1:{"alpha":[{"v":1}]}\n2:{"beta":[{"v":2}]}\n';
    const [a, b] = parseRscPayloads<{ v: number }>(body, ["alpha", "beta"], pick);
    expect(a).toEqual([{ v: 1 }]);
    expect(b).toEqual([{ v: 2 }]);
  });

  it("resolves two markers riding the same line (shared parse)", () => {
    const body = '1:{"alpha":[{"v":1}],"beta":[{"v":2}]}\n';
    const out = parseRscPayloads<{ v: number }>(body, ["alpha", "beta"], pick);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual([{ v: 1 }]);
    expect(out[1]).toEqual([{ v: 1 }]);
  });

  it("throws naming the marker that cannot resolve", () => {
    const body = '1:{"alpha":[{"v":1}]}\n';
    expect(() => parseRscPayloads(body, ["alpha", "missing"], pick)).toThrow(/"missing" not found/);
  });

  it("resolves a marker behind a multi-MB sibling string via the balanced fallback", () => {
    const body = `1:{"pad":"${"x".repeat(2 * 1024 * 1024 + 16)}","alpha":[{"v":1}]}\n`;
    const out = parseRscPayload<{ v: number }>(
      body,
      "alpha",
      (tree) => (tree as { alpha?: { v: number }[] }).alpha ?? null,
    );
    expect(out).toEqual([{ v: 1 }]);
  });

  it("gives up bounded when the oversized marker value is truncated mid-value", () => {
    const body = `1:{"pad":"${"x".repeat(2 * 1024 * 1024 + 16)}","alpha":[{"v":1}`;
    expect(() =>
      parseRscPayload<{ v: number }>(body, "alpha", (tree) => (tree as { alpha?: { v: number }[] }).alpha ?? null),
    ).toThrow(/not found/);
  });
});

describe("parseFeed", () => {
  it("extracts the alternate link when an Atom entry has multiple links", () => {
    const xml = `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>T</title>
        <entry>
          <title>E1</title>
          <link rel="self" href="https://x.example/self"/>
          <link rel="alternate" type="text/html" href="https://x.example/post-1"/>
          <id>e1</id>
          <updated>2026-08-01T00:00:00Z</updated>
        </entry>
      </feed>`;
    const items = parseFeed(xml, "https://x.example/feed");
    expect(items).toHaveLength(1);
    expect(items[0]?.link).toBe("https://x.example/post-1");
  });

  it("falls back to the first link with an href when no alternate exists", () => {
    const xml = `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>T</title>
        <entry>
          <title>E1</title>
          <link rel="self" href="https://x.example/self"/>
          <link rel="enclosure" href="https://x.example/file.mp3"/>
          <id>e1</id>
        </entry>
      </feed>`;
    const items = parseFeed(xml, "https://x.example/feed");
    expect(items[0]?.link).toBe("https://x.example/self");
  });

  it("stringifies guid objects via their text node instead of [object Object]", () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <title>T</title>
        <item>
          <title>I1</title>
          <link>https://y.example/a</link>
          <guid isPermaLink="false">guid-123</guid>
        </item>
      </channel></rss>`;
    const items = parseFeed(xml, "https://y.example/feed");
    expect(items[0]?.id).toBe("guid-123");
  });

  it("reads attributed titles via their text node instead of [object Object]", () => {
    const xml = `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>T</title>
        <entry>
          <title type="text">Real Title</title>
          <link rel="alternate" href="https://x.example/p1"/>
          <id>e1</id>
        </entry>
      </feed>`;
    const items = parseFeed(xml, "https://x.example/feed");
    expect(items[0]?.title).toBe("Real Title");
  });

  it("falls back to the link for ids when guid is absent", () => {
    const withLink = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <title>T</title>
        <item><title>A</title><link>https://y.example/a</link></item>
      </channel></rss>`;
    expect(parseFeed(withLink, "https://y.example/feed")[0]?.id).toBe("https://y.example/a");
  });

  it("drops entries that expose no usable link", () => {
    const withoutLink = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <title>T</title>
        <item><title>Only Title</title></item>
        <item><title>Keep</title><link>https://y.example/keep</link></item>
      </channel></rss>`;
    const items = parseFeed(withoutLink, "https://y.example/feed");
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("Keep");
  });

  it("keeps valid items sitting beyond the first 50 raw entries", () => {
    const junk = Array.from({ length: 55 }, (_, i) => `<item><title>J${i}</title></item>`).join("");
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <title>T</title>
        ${junk}<item><title>Real</title><link>https://y.example/real</link></item>
      </channel></rss>`;
    const items = parseFeed(xml, "https://y.example/feed");
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("Real");
  });

  it("throws UpstreamError (502) on garbage feeds instead of generic Error", () => {
    expect(() => parseFeed("not xml at all <>>>", "https://y.example/feed")).toThrow(/Unrecognized|Unparseable/);
    try {
      parseFeed("not xml at all <>>>", "https://y.example/feed");
    } catch (e) {
      expect((e as Error).name).toBe("UpstreamError");
    }
  });

  it("trims whitespace links and supports numeric guid", () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <title>T</title>
        <item><title>N</title><link>  https://y.example/spaced  </link><guid>12345</guid></item>
      </channel></rss>`;
    const items = parseFeed(xml, "https://y.example/feed");
    expect(items[0]?.link).toBe("https://y.example/spaced");
    expect(items[0]?.id).toBe("12345");
  });

  it("strips HTML and truncates abusive titles", () => {
    const longTitle = `A${"x".repeat(500)}`;
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <title>T</title>
        <item><title><![CDATA[<p>${longTitle}</p>]]></title><link>https://y.example/a</link></item>
      </channel></rss>`;
    const items = parseFeed(xml, "https://y.example/feed");
    expect(items[0]?.title.length).toBeLessThanOrEqual(300);
  });
});

describe("primitives", () => {
  it("numOr never throws and treats empty string as fallback", () => {
    expect(numOr("", 7)).toBe(7);
    expect(numOr("   ", 7)).toBe(7);
    expect(numOr("12.5", 0)).toBe(12.5);
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
  it("isoDate accepts ISO, trims, and rejects loose formats", () => {
    expect(isoDate("2026-08-01")).toBe("2026-08-01");
    expect(isoDate("  2026-08-01T00:00:00Z  ")).toBe("2026-08-01T00:00:00Z");
    expect(isoDate("Jan 1 2020")).toBeNull();
    expect(isoDate("2020/01/01")).toBeNull();
  });
  it("numPositive/numNonNegative/numIntNonNegative behave", () => {
    expect(numPositive(0)).toBeNull();
    expect(numNonNegative(0)).toBe(0);
    expect(numIntNonNegative(3.9)).toBe(3);
    expect(numIntNonNegative(-1)).toBeNull();
  });
});

describe("getOpenLicense", () => {
  it("matches exact and versioned prefixes", () => {
    expect(getOpenLicense(["license:mit"])).toBe("mit");
    expect(getOpenLicense(["license:llama4"])).toBe("llama4");
    expect(getOpenLicense(["license:qwen2.5"])).toBe("qwen2.5");
  });
  it("excludes NoDerivatives even though cc prefix would match", () => {
    expect(getOpenLicense(["license:cc-by-nd-4.0"])).toBeNull();
    expect(getOpenLicense(["license:cc-by-nc-nd-4.0"])).toBeNull();
    expect(getOpenLicense(["license:cc-by-nc-4.0"])).toBe("cc-by-nc-4.0");
  });
  it("normalizes underscores and skips non-license tags", () => {
    expect(getOpenLicense(["license:apache_2.0"])).toBe("apache-2.0");
    expect(getOpenLicense(["other", "license:other"])).toBeNull();
  });
  it("resolves new families and first-wins dual licenses", () => {
    expect(getOpenLicense(["license:mistral"])).toBe("mistral");
    expect(getOpenLicense(["license:other", "license:phi-2"])).toBe("phi-2");
  });
});
