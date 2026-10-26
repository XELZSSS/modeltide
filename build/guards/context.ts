import fs from "node:fs";
import path from "node:path";

/**
 * What one guard rule reads with. The cache lives for exactly one run of the guard: `configureServer` re-runs every
 * rule on each watched change, so a module-level cache would serve the files the dev server started with — the
 * failure mode the guard exists to prevent.
 */
export interface GuardContext {
  readonly rootDir: string;
  /** Repo-relative POSIX path → file contents, read at most once per run. */
  readText(rel: string): string;
}

export function createGuardContext(rootDir: string): GuardContext {
  const cache = new Map<string, string>();
  return {
    rootDir,
    readText(rel) {
      const cached = cache.get(rel);
      if (cached !== undefined) return cached;
      const text = fs.readFileSync(path.join(rootDir, rel), "utf8");
      cache.set(rel, text);
      return text;
    },
  };
}

/**
 * One consistency rule.
 *
 * `watches` is the part that keeps the dev server honest: `configureServer` used to carry a single hand-maintained
 * list of every file any rule touched, so a new rule that read a new file only re-checked itself after a restart. A
 * rule now names what invalidates it and the watcher set is the union.
 */
export interface GuardRule {
  /** Stable id, used by the registry for ordering and by a failure report to name the rule. */
  readonly id: string;
  /** Repo-relative POSIX paths whose change must re-run this rule. */
  readonly watches: readonly string[];
  /** A directory prefix whose contents invalidate this rule, for rules that care about a whole tree. */
  readonly watchesPrefix?: string;
  run(ctx: GuardContext): void;
}

/** Directory listing helper for the two rules that reason about a tree rather than a file. */
export function listDir(rootDir: string, rel: string): fs.Dirent[] {
  return fs.readdirSync(path.join(rootDir, rel), { withFileTypes: true });
}

/** Recursive repo-relative POSIX listing, for the ownership rule's source sweep. */
export function listDirRecursive(rootDir: string, rel: string): string[] {
  return fs.readdirSync(path.join(rootDir, rel), { recursive: true }).map(String);
}
