// Common HTML named entities seen in scraped content; numeric references are handled by ENTITY_RE below.
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

// Only emit valid Unicode scalar values; out-of-range or unassigned code points are dropped.
function safeFromCodePoint(cp: number): string {
  if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff) return "";
  try {
    return String.fromCodePoint(cp);
  } catch (e) {
    console.warn("[html] invalid code point:", e);
    return "";
  }
}

/** Strip tags while keeping text; ignores ">" inside quoted attributes and tolerates unterminated tags. Drops <script>/<style> content. */
export function stripHtml(s: string): string {
  const clean = s
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ");
  let out = "";
  let i = 0;
  while (i < clean.length) {
    const lt = clean.indexOf("<", i);
    if (lt === -1) return out + clean.slice(i);
    out += clean.slice(i, lt);
    const end = findTagEnd(clean, lt);
    if (end === -1) {
      out += clean.slice(lt, lt + 1);
      i = lt + 1;
      continue;
    }
    i = end + 1;
  }
  return out;
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
