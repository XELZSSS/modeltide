import { listDirRecursive, type GuardContext, type GuardRule } from "./context.ts";

/**
 * `src/client/api` is four layers that only depend downwards:
 *
 *   transport  ← query  ← decode  ← present
 *
 * and `view-models.ts` sits on top of all four. Nothing below a layer may import above it, and no layer may import the
 * view models: `transport` importing `query` is how the same fetch came to be re-derived per query, and `query`
 * importing `view-models` would make a cache key depend on a component's state shape.
 *
 * The rule is a static import scan rather than a lint config because the allowed set is per *layer*, and oxlint's
 * `no-restricted-imports` matches patterns globally — it cannot say "inside `query/`, `../present/` is a violation but
 * `../transport/` is not".
 */
const LAYER_DIRS = ["transport", "query", "decode", "present"] as const;
type LayerDir = (typeof LAYER_DIRS)[number];

/** What each layer may import from inside `src/client/api`. A layer may always import its own directory. */
const MAY_IMPORT: Record<LayerDir, readonly LayerDir[]> = {
  // transport sits at the bottom: nothing above it, and no sibling.
  transport: [],
  // query builds on the one fetch and on the decode helpers it needs for partial detection.
  query: ["transport", "decode"],
  decode: ["transport"],
  present: ["transport"],
};

/** The view models sit above every layer, so they may reach all of them. */
const VIEW_MODELS_MAY_IMPORT: readonly LayerDir[] = LAYER_DIRS;

const API_DIR = "src/client/api";
const IMPORT_RE = /from\s+"([^"]+)"/g;

interface ApiFile {
  /** Repo-relative path of the importing file. */
  rel: string;
  /** Which layer it belongs to, or `"view-models"` for the top module. */
  layer: LayerDir | "view-models";
  /** Every specifier it imports from inside `src/client/api`, as a layer name. */
  imports: readonly LayerDir[];
}

/** The layer a file at `rel` sits in, or `undefined` for the barrel and the tests that are not layer code. */
function layerOf(rel: string): ApiFile["layer"] | undefined {
  const within = rel.slice(API_DIR.length + 1);
  if (within === "view-models.ts") return "view-models";
  const dir = within.split("/")[0] ?? "";
  return (LAYER_DIRS as readonly string[]).includes(dir) ? (dir as LayerDir) : undefined;
}

/** The layer an `src/client/api`-internal specifier points into, or `undefined` when it points outside that tree. */
function targetLayer(from: string, specifier: string): LayerDir | undefined {
  if (!specifier.startsWith(".")) return undefined;
  // Resolve `./x` and `../layer/x` against the importing file's own directory.
  const base = from.slice(0, from.lastIndexOf("/"));
  const parts = base.split("/");
  for (const segment of specifier.split("/")) {
    if (segment === "." || segment === "") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  const resolved = parts.join("/");
  const within = resolved.slice(API_DIR.length + 1);
  const dir = within.split("/")[0] ?? "";
  return (LAYER_DIRS as readonly string[]).includes(dir) ? (dir as LayerDir) : undefined;
}

function apiFiles(ctx: GuardContext): ApiFile[] {
  const files: ApiFile[] = [];
  for (const entry of listDirRecursive(ctx.rootDir, API_DIR)) {
    const rel = `${API_DIR}/${entry.replaceAll("\\", "/")}`;
    if (!rel.endsWith(".ts") || rel.endsWith(".test.ts")) continue;
    const layer = layerOf(rel);
    if (layer === undefined) continue;
    const imports: LayerDir[] = [];
    for (const match of ctx.readText(rel).matchAll(IMPORT_RE)) {
      const target = targetLayer(rel, match[1]!);
      if (target !== undefined) imports.push(target);
    }
    files.push({ rel, layer, imports });
  }
  return files;
}

function violation(file: ApiFile): string | undefined {
  const allowed =
    file.layer === "view-models" ? VIEW_MODELS_MAY_IMPORT : [file.layer, ...MAY_IMPORT[file.layer as LayerDir]];
  const bad = file.imports.find((target) => !allowed.includes(target));
  return bad === undefined
    ? undefined
    : `${file.rel} (${file.layer}) imports ${bad}/ — a layer may only import ${allowed.join(", ")}`;
}

/**
 * The dependency direction inside `src/client/api`. Without it, "four layers" is a directory layout a refactor can
 * undo silently: every import still resolves, types still check, and the layer that started as the bottom of the stack
 * ends up calling back up into the one above it.
 */
export const apiLayersRule: GuardRule = {
  id: "api-layers",
  watches: [],
  watchesPrefix: `${API_DIR}/`,
  run(ctx: GuardContext) {
    const problems = apiFiles(ctx).flatMap((file) => violation(file) ?? []);
    if (problems.length > 0) {
      throw new Error(`src/client/api layer violations:\n  ${problems.join("\n  ")}`);
    }
  },
};
