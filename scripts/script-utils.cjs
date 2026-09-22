// @ts-check
const fs = require("fs");
const path = require("path");

function* walkTs(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkTs(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield full;
  }
}

/**
 * Literal-aware scan shared by the two source views below. String, template and
 * `${}`-interpolation content always comes through verbatim; only code outside a
 * literal is reshaped.
 *
 * With `dropWhitespace`, code whitespace and block-comment placeholders are
 * removed as well, so a formatting-only edit leaves the output unchanged.
 */
function scanSource(src, { dropWhitespace = false } = {}) {
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
      i = end === -1 ? n : end + 2;
      if (!dropWhitespace) out += " ";
      continue;
    }
    if (c === "/" && next === "/") {
      const end = src.indexOf("\n", i + 2);
      i = end === -1 ? n : end;
      continue;
    }
    if (dropWhitespace && /\s/.test(c)) {
      i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** Comment-free source; code whitespace is left alone. */
function stripComments(src) {
  return scanSource(src);
}

/**
 * Comment- and whitespace-free source view for cache-version hashing.
 *
 * Whitespace inside a literal is data, so it survives: `"a b"` and `"ab"` stay
 * distinct, as do the spaces in a `String.raw` pattern. Whitespace in code is
 * not, so the hash stays put across formatting and moves only when the code or a
 * literal actually changes.
 *
 * Regex literals are not tracked — the scanner cannot tell `/…/` from division —
 * so whitespace inside a bare regex is dropped too. Keep such a pattern in a
 * template literal when its spacing is load-bearing.
 */
function normalizeSource(src) {
  return scanSource(src, { dropWhitespace: true });
}

module.exports = { walkTs, stripComments, normalizeSource };
