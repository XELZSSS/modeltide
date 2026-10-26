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

const WHITESPACE_RUN_RE = /\s+/g;
const SCRIPT_CLOSE_RE = /<\/script\s*>/gi;
const STYLE_CLOSE_RE = /<\/style\s*>/gi;

const isAsciiLetter = (c: number): boolean => (c >= 0x61 && c <= 0x7a) || (c >= 0x41 && c <= 0x5a);

const isTagNameChar = (c: number): boolean => isAsciiLetter(c) || (c >= 0x30 && c <= 0x39) || c === 0x2d;

/**
 * Reads the tag name between `<` and `>` by scanning. The previous `trim()` + regex + `replace()` built three
 * intermediate strings per tag, and a page body runs this once for every tag it contains.
 */
function tagNameOf(tagInner: string): string {
  let i = 0;
  while (i < tagInner.length && tagInner.charCodeAt(i) <= 0x20) i++;
  if (tagInner.charCodeAt(i) === 0x2f) i++;
  const start = i;
  if (!isAsciiLetter(tagInner.charCodeAt(i))) return "";
  i++;
  while (i < tagInner.length && isTagNameChar(tagInner.charCodeAt(i))) i++;
  const name = tagInner.slice(start, i);
  return name === name.toLowerCase() ? name : name.toLowerCase();
}

export function stripHtml(s: unknown): string {
  if (typeof s !== "string" || !s) return "";
  const parts: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (s.startsWith("<!--", i)) {
      const end = s.indexOf("-->", i + 4);
      if (end === -1) {
        // Unterminated comment: keep the remainder as text, the way an unterminated tag below is kept.
        parts.push(s.slice(i));
        break;
      }
      i = end + 3;
      continue;
    }
    if (s.charCodeAt(i) !== 0x3c) {
      const next = s.indexOf("<", i + 1);
      const end = next === -1 ? s.length : next;
      parts.push(s.slice(i, end));
      i = end;
      continue;
    }
    if (s.startsWith("<![CDATA[", i)) {
      const end = s.indexOf("]]>", i + 9);
      // The CDATA payload is markup by definition (`content:encoded` is HTML in an XML wrapper), so its text is folded
      // back into the same scan instead of being emitted verbatim: pushing it raw left every tag inside `<![CDATA[…]]>`
      // in the output, and `feed-fields` had to strip the decoded title a second time to cover it.
      const inner = end === -1 ? s.slice(i + 9) : s.slice(i + 9, end);
      if (inner.includes("<")) {
        parts.push(stripHtml(inner));
      } else {
        parts.push(inner);
      }
      if (end === -1) break;
      i = end + 3;
      continue;
    }
    if (s.startsWith("<!", i) || s.startsWith("<?", i)) {
      const end = findTagEnd(s, i);
      if (end === -1) {
        parts.push(s.slice(i));
        break;
      }
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
    if (!name) {
      const next = s.indexOf("<", i + 1);
      const textEnd = next === -1 ? s.length : next;
      parts.push(s.slice(i, textEnd));
      i = textEnd;
      continue;
    }
    if (name === "script" || name === "style") {
      const closeRe = name === "script" ? SCRIPT_CLOSE_RE : STYLE_CLOSE_RE;
      closeRe.lastIndex = end + 1;
      const m = closeRe.exec(s);
      parts.push(" ");
      i = m ? m.index + m[0].length : s.length;
      continue;
    }
    if (BLOCK_TAGS.has(name)) parts.push(" ");
    i = end + 1;
  }
  return parts.join("").replace(WHITESPACE_RUN_RE, " ").trim();
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
