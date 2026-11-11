import { listDirRecursive, type GuardRule } from "./context.ts";

/**
 * The style spec is only a spec while nothing bypasses it: components name roles and tokens, never raw values.
 * `src/styles` owns the scale, so it is never scanned.
 */
const COLOR_SOURCES = new Set(["src/client/charts/theme.ts"]);

const SPEC_RULES: readonly { pattern: RegExp; message: string }[] = [
  { pattern: /#[0-9a-fA-F]{3,8}\b/, message: "raw colour; use a theme token or a `ui-*` role" },
  {
    pattern:
      /\b(?:bg|text|border|ring|outline|fill|stroke|from|to|via|divide)-(?:white|black|gray|slate|zinc|neutral|stone)(?:-\d{2,3})?\b/,
    message: "raw palette colour; use a semantic role (bg-card, text-text-secondary, border-border)",
  },
  { pattern: /\btext-(?:xs|sm|base|lg|xl|2xl|3xl)\b/, message: "raw size; use a `ui-*` type role" },
  { pattern: /\b(?:text|leading|tracking)-\[\d/, message: "arbitrary type value; use a `ui-*` type role" },
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export const classesRule: GuardRule = {
  id: "classes",
  watches: [],
  watchesPrefix: "src/client",
  run(ctx) {
    for (const file of listDirRecursive(ctx.rootDir, "src/client")) {
      const rel = `src/client/${file}`.replaceAll("\\", "/");
      if (!/\.(vue|ts)$/.test(rel) || rel.endsWith(".test.ts")) continue;
      if (COLOR_SOURCES.has(rel)) continue;
      const source = stripComments(ctx.readText(rel));
      for (const { pattern, message } of SPEC_RULES) {
        const found = pattern.exec(source);
        if (found === null) continue;
        const line = source.slice(0, found.index).split("\n").length;
        throw new Error(`${rel}:${line}: "${found[0]}" — ${message}`);
      }
    }
  },
};
