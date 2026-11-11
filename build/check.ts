import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Runs the consistency rules without a build: `npm run build` goes types -> lint -> format -> suites -> bundle, which
 * nobody runs while editing, so this loads the rules through Node's own TypeScript support and stops at the first
 * violation. Two things the Vite config graph gives the rules for free are provided here: a sync resolve hook maps the
 * `@/x` alias to `src/x` (trying `x`, `x.ts`, `x/index.ts`), and the guards' explicit `.ts` specifiers Node accepts.
 */
const rootDir = path.resolve(import.meta.dirname, "..");

function aliasTarget(request: string): string {
  const base = path.join(rootDir, "src", request.slice(2));
  for (const candidate of [base, `${base}.ts`, path.join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(
    `build/check.ts: "${request}" has no target under src/ (tried ${base}, ${base}.ts, ${base}/index.ts)`,
  );
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
    return { url: pathToFileURL(aliasTarget(specifier)).href, shortCircuit: true };
  },
});

const { checkConsistency } = await import("./guards/index.ts");

checkConsistency(rootDir);
console.log("[consistency] all rules pass");
