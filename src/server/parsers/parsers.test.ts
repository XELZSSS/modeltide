import { describe, expect, it } from "vitest";
import { decodeEntities, stripHtml } from "@/server/parsers/html";
import { findArrayInTree, findNextData, parseRscPayload } from "@/server/parsers/rsc";
import { parseFeed } from "@/server/parsers/rss";

// Consolidated tests for the upstream content parsers: HTML entities, RSC payload trees and RSS/Atom feeds.

// -- html ---------------------------------------------------------------------

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
  it("rejects out-of-range code points", () => {
    expect(decodeEntities("&#x110000;")).toBe("");
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
});

// -- rsc ----------------------------------------------------------------------

describe("findNextData", () => {
  it("finds the first array under a key in a nested tree", () => {
    const tree = { leaderboard: { entries: [{ rank: 1 }] } };
    expect(findNextData(tree, "entries")).toEqual([{ rank: 1 }]);
  });

  it("returns null when the key is absent", () => {
    expect(findNextData({ other: [1] }, "entries")).toBeNull();
  });
});

describe("findArrayInTree", () => {
  it("returns the largest matching array", () => {
    const tree = {
      a: [{ id: 1, marker: true }],
      b: [
        { id: 2, marker: true },
        { id: 3, marker: true },
      ],
    };
    const result = findArrayInTree<{ id: number }>(tree, (m) => (m as { marker?: boolean })?.marker === true);
    expect(result).toHaveLength(2);
  });

  it("returns null when no array matches", () => {
    expect(findArrayInTree({ a: [1] }, () => false)).toBeNull();
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

  it("parses hex-prefixed chunk lines (Next.js flight ids are hex, e.g. \"c:\")", () => {
    // Real AA payload shape: the models catalog lives on a hex-id chunk line.
    const body = '0:{"$a":1}\nc:["$","$L5",null,{"models":[{"slug":"claude-opus-5"},{"slug":"gpt-5"}]}]\n1:{"ignore":true}\n';
    const out = parseRscPayload<{ slug: string }>(
      body,
      "models",
      // Mirrors the Artificial Analysis extractor: dig the marker array out of
      // the client-component tree rather than reading a top-level key.
      (tree) => findNextData<{ slug: string }>(tree, "models"),
    );
    expect(out).toEqual([{ slug: "claude-opus-5" }, { slug: "gpt-5" }]);
  });

  it("throws when the marker is absent", () => {
    expect(() => parseRscPayload('1:{"a":1}', "missing", () => null)).toThrow(/not found/);
  });
});

// -- rss ----------------------------------------------------------------------

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
});
