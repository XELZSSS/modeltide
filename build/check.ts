import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Runs the consistency rules without a build.
 *
 * `npm run build` is clean → types → lint → format → the frozen 34 suites → bundle, which nobody runs while editing; the
 * same rules therefore used to report only at `vite dev` startup/save or at the end of a full build. This is the fast
 * entry point: it loads the rules through Node's own TypeScript support and stops at the first violation.
 *
 * Two things the Vite config graph gives the rules for free have to be provided here:
 *
 * 1. The guards import `src/shared` modules, which import each other through the `@/` alias. Node resolves it to nothing,
 *    so a sync resolve hook maps `@/x` to `src/x`, trying `x`, `x.ts` and `x/index.ts` — the same three shapes the alias
 *    covers in the workspace.
 * 2. `build/guards/index.ts` imports its siblings with explicit `.ts` specifiers, which Node accepts as-is.
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
