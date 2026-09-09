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

// Hoisted module constants: stripHtml runs over every feed description and
// title; allocating a fresh regex per script/style tag is pure GC pressure.
// Single-threaded + lastIndex reset before each exec keeps reuse safe.
const SCRIPT_CLOSE_RE = /<\/script\s*>/gi;
const STYLE_CLOSE_RE = /<\/style\s*>/gi;

export function stripHtml(s: string): string {
  const parts: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (s.startsWith("<!--", i)) {
      const end = s.indexOf("-->", i + 4);
      if (end === -1) break;
      i = end + 3;
      continue;
    }
    const ch = s[i]!;
    if (ch !== "<") {
      const next = s.indexOf("<", i + 1);
      const end = next === -1 ? s.length : next;
      parts.push(s.slice(i, end));
      i = end;
      continue;
    }
    if (s.startsWith("<![CDATA[", i)) {
      const end = s.indexOf("]]>", i + 9);
      if (end === -1) {
        parts.push(s.slice(i + 9));
        break;
      }
      parts.push(s.slice(i + 9, end));
      i = end + 3;
      continue;
    }
    if (s.startsWith("<!", i) || s.startsWith("<?", i)) {
      const end = findTagEnd(s, i);
      if (end === -1) break;
      i = end + 1;
      continue;
    }
    const end = findTagEnd(s, i);
    if (end === -1) {
      parts.push(s.slice(i));
      break;
    }
    const inner = s.slice(i + 1, end);
    const name = tagNameOf(inner);
    if (name === "script" || name === "style") {
      const closeRe = name === "script" ? SCRIPT_CLOSE_RE : STYLE_CLOSE_RE;
      closeRe.lastIndex = end + 1;
      const m = closeRe.exec(s);
      parts.push(" ");
      i = m ? m.index + m[0].length : s.length;
      continue;
    }
    parts.push(BLOCK_TAGS.has(name) ? " " : "");
    i = end + 1;
  }
  return parts.join("").replace(/\s+/g, " ").trim();
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
