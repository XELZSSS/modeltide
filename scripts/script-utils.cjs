const REGEX_PRECEDING = new Set([
  "(",
  ",",
  "=",
  ":",
  "[",
  "!",
  "&",
  "|",
  "?",
  "{",
  "}",
  ";",
  "+",
  "-",
  "*",
  "%",
  "<",
  ">",
  "~",
  "^",
]);

const REGEX_KEYWORDS = new Set([
  "return",
  "typeof",
  "case",
  "in",
  "of",
  "do",
  "else",
  "instanceof",
  "void",
  "delete",
  "new",
  "throw",
  "yield",
  "await",
]);

function scanRegex(src, start) {
  let inClass = false;
  for (let j = start + 1; j < src.length; j++) {
    const ch = src[j];
    if (ch === "\n") return -1;
    if (ch === "\\") {
      j += 1;
      continue;
    }
    if (ch === "[") inClass = true;
    else if (ch === "]") inClass = false;
    else if (ch === "/" && !inClass) {
      let k = j + 1;
      while (k < src.length && /[a-zA-Z]/.test(src[k])) k += 1;
      return k;
    }
  }
  return -1;
}

function regexAllowed(out) {
  let j = out.length - 1;
  while (j >= 0 && /\s/.test(out[j])) j -= 1;
  if (j < 0) return true;
  if (REGEX_PRECEDING.has(out[j])) return true;
  const m = /([A-Za-z_$][A-Za-z0-9_$]*)$/.exec(out.slice(Math.max(0, j - 31), j + 1));
  return m != null && REGEX_KEYWORDS.has(m[1]);
}

function scanSource(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  let quote = null;
  const stack = [];
  while (i < n) {
    const c = src[i];
    const next = i + 1 < n ? src[i + 1] : "";
    if (quote) {
      out += c;
      if (c === "\\" && i + 1 < n) {
        out += src[i + 1];
        i += 2;
        continue;
      }
      if (quote === "`" && c === "$" && next === "{") {
        stack.push(quote);
        quote = null;
        out += next;
        i += 2;
        continue;
      }
      if (c === quote) {
        quote = null;
      }
      i += 1;
      continue;
    }
    if (stack.length && c === "}") {
      stack.pop();
      quote = "`";
      out += c;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      if (end === -1) {
        out += c;
        i += 1;
        continue;
      }
      i = end + 2;
      out += " ";
      continue;
    }
    if (c === "/" && next === "/" && out[out.length - 1] !== "\\") {
      const end = src.indexOf("\n", i + 2);
      i = end === -1 ? n : end;
      continue;
    }
    if (c === "/" && regexAllowed(out)) {
      const end = scanRegex(src, i);
      if (end > 0) {
        out += src.slice(i, end);
        i = end;
        continue;
      }
    }
    out += c;
    i += 1;
  }
  return out;
}

function stripComments(src) {
  return scanSource(src);
}

module.exports = { stripComments };
