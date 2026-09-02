// Common HTML named entities seen in scraped content; numeric references are handled by ENTITY_RE below.
// Kept intentionally small (~100 high-frequency entries) to stay lean in the
// Worker bundle; unknown entities are left untouched by decodeEntities.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00A0",
  ensp: "\u2002",
  emsp: "\u2003",
  thinsp: "\u2009",
  zwnj: "\u200C",
  zwj: "\u200D",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D",
  sbquo: "\u201A",
  bdquo: "\u201E",
  lsaquo: "\u2039",
  rsaquo: "\u203A",
  laquo: "\u00AB",
  raquo: "\u00BB",
  copy: "\u00A9",
  reg: "\u00AE",
  trade: "\u2122",
  times: "\u00D7",
  divide: "\u00F7",
  minus: "\u2212",
  micro: "\u00B5",
  deg: "\u00B0",
  plusmn: "\u00B1",
  sup2: "\u00B2",
  sup3: "\u00B3",
  frac12: "\u00BD",
  frac14: "\u00BC",
  frac34: "\u00BE",
  bull: "\u2022",
  middot: "\u00B7",
  permil: "\u2030",
  prime: "\u2032",
  Prime: "\u2033",
  oline: "\u203E",
  frasl: "\u2044",
  dagger: "\u2020",
  Dagger: "\u2021",
  sect: "\u00A7",
  para: "\u00B6",
  euro: "\u20AC",
  pound: "\u00A3",
  yen: "\u00A5",
  cent: "\u00A2",
  curren: "\u00A4",
  brvbar: "\u00A6",
  iexcl: "\u00A1",
  iquest: "\u00BF",
  ordf: "\u00AA",
  ordm: "\u00BA",
  eacute: "\u00E9",
  egrave: "\u00E8",
  agrave: "\u00E0",
  ccedil: "\u00E7",
  uuml: "\u00FC",
  ouml: "\u00F6",
  auml: "\u00E4",
  // High-frequency extras (arrows, checks, math, Latin) seen in feed titles.
  larr: "\u2190",
  uarr: "\u2191",
  rarr: "\u2192",
  darr: "\u2193",
  harr: "\u2194",
  crarr: "\u21B5",
  lArr: "\u21D0",
  uArr: "\u21D1",
  rArr: "\u21D2",
  dArr: "\u21D3",
  hArr: "\u21D4",
  check: "\u2713",
  cross: "\u2717",
  star: "\u2605",
  hearts: "\u2665",
  sup1: "\u00B9",
  frac13: "\u2153",
  frac23: "\u2154",
  frac15: "\u2155",
  frac25: "\u2156",
  infin: "\u221E",
  ne: "\u2260",
  le: "\u2264",
  ge: "\u2265",
  lowast: "\u2217",
  radic: "\u221A",
  sum: "\u2211",
  prod: "\u220F",
  part: "\u2202",
  alpha: "\u03B1",
  beta: "\u03B2",
  pi: "\u03C0",
  oelig: "\u0153",
  OElig: "\u0152",
  szlig: "\u00DF",
};

// Matches hex (&#x..) and decimal (&#..) with optional semicolon, and named entities requiring semicolon to avoid over-decoding.
const ENTITY_RE = /&(?:#x([0-9a-fA-F]+);?|#([0-9]+);?|([a-zA-Z][a-zA-Z0-9]*);)/g;

/** Decode HTML entities to their Unicode characters, leaving unknown entities untouched. */
export function decodeEntities(s: string): string {
  return s.replace(ENTITY_RE, (m, hex?: string, dec?: string, name?: string) => {
    if (hex) return safeFromCodePoint(parseInt(hex, 16));
    if (dec) return safeFromCodePoint(parseInt(dec, 10));
    return NAMED_ENTITIES[name!] ?? m;
  });
}

// Only emit valid Unicode scalar values; surrogates, NUL and out-of-range
// code points are dropped. Silent by design: feeds with malicious entities
// must not spam Worker logs.
function safeFromCodePoint(cp: number): string {
  if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff) return "";
  if (cp >= 0xd800 && cp <= 0xdfff) return "";
  try {
    return String.fromCodePoint(cp);
  } catch {
    return "";
  }
}

/** Block-level tags render with a break, so they become a space when stripped. */
const BLOCK_TAGS = new Set([
  "p",
  "div",
  "br",
  "li",
  "ul",
  "ol",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "section",
  "article",
  "header",
  "footer",
  "blockquote",
  "pre",
  "hr",
  "table",
  "tr",
  "td",
  "th",
  "thead",
  "tbody",
]);

function tagNameOf(tagInner: string): string {
  const m = /^[^\s/>]+/.exec(tagInner.trim());
  return (m?.[0] ?? "").toLowerCase().replace(/^\//, "");
}

/**
 * Strip tags while keeping text; quote-aware (ignores ">" inside attributes),
 * skips comments/doctype/PI, drops <script>/<style> content, maps block tags
 * to a space to avoid "HelloWorld"粘连, and collapses whitespace.
 */
export function stripHtml(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    // HTML comments: skip whole <!-- ... --> block.
    if (s.startsWith("<!--", i)) {
      const end = s.indexOf("-->", i + 4);
      if (end === -1) break;
      i = end + 3;
      continue;
    }
    const ch = s[i]!;
    if (ch !== "<") {
      out += ch;
      i++;
      continue;
    }
    // CDATA: keep inner text.
    if (s.startsWith("<![CDATA[", i)) {
      const end = s.indexOf("]]>", i + 9);
      if (end === -1) {
        out += s.slice(i + 9);
        break;
      }
      out += s.slice(i + 9, end);
      i = end + 3;
      continue;
    }
    // Doctype / processing instructions: drop silently.
    if (s.startsWith("<!", i) || s.startsWith("<?", i)) {
      const end = findTagEnd(s, i);
      if (end === -1) break;
      i = end + 1;
      continue;
    }
    const end = findTagEnd(s, i);
    if (end === -1) {
      out += "<";
      i++;
      continue;
    }
    const inner = s.slice(i + 1, end);
    const name = tagNameOf(inner);
    if (name === "script" || name === "style") {
      // Quote-aware open tag already consumed; skip until matching close.
      const closeRe = name === "script" ? /<\/script\s*>/gi : /<\/style\s*>/gi;
      closeRe.lastIndex = end + 1;
      const m = closeRe.exec(s);
      out += " ";
      i = m ? m.index + m[0].length : s.length;
      continue;
    }
    out += BLOCK_TAGS.has(name) ? " " : "";
    i = end + 1;
  }
  return out.replace(/\s+/g, " ").trim();
}

function findTagEnd(html: string, start: number): number {
  let quote: string | null = null;
  for (let j = start + 1; j < html.length; j++) {
    const ch = html[j]!;
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ">") return j;
  }
  return -1;
}
