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

function stripComments(src) {
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
      out += " ";
      continue;
    }
    if (c === "/" && next === "/") {
      const end = src.indexOf("\n", i + 2);
      i = end === -1 ? n : end;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

module.exports = { walkTs, stripComments };
