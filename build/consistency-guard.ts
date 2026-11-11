import path from "node:path";
import type { Plugin } from "vite";
import { errMsg } from "../src/shared/utils/text.ts";
import { rootDir } from "../vite.shared.ts";
import { checkConsistency, GUARD_WATCHES } from "./guards/index.ts";

/**
 * The consistency guard: rules that only a build can enforce, because none of them is visible to types, lint or the
 * suite. They live in `build/guards/`, one module per concern, and each declares the paths whose change invalidates
 * it; this file only decides *when* to run them, holding the Vite hook wiring and nothing else.
 */
export function consistencyGuard(): Plugin {
  let ranBuild = false;
  return {
    name: "modeltide:consistency",
    // Applies to `vite dev` as well as `vite build`: neither type-check nor lint evaluates these rules, so a violation stays invisible until a production build runs.
    buildStart() {
      if (ranBuild) return;
      if (this.environment?.name != null && this.environment.name !== "client") return;
      ranBuild = true;
      checkConsistency(rootDir);
    },
    /**
     * Dev re-checks on change: the rules read `theme.css`, `globals.css`, `index.html` and the component tree, none of
     * which the client graph imports, so a `buildStart`-only check validated the files the server started with.
     */
    configureServer(server) {
      server.watcher.on("all", (_event, file) => {
        const rel = path.relative(rootDir, file).replaceAll("\\", "/");
        if (!GUARD_WATCHES.files.has(rel) && !GUARD_WATCHES.prefixes.some((prefix) => rel.startsWith(prefix))) return;
        try {
          checkConsistency(rootDir);
        } catch (err) {
          server.config.logger.error(`[consistency] ${errMsg(err)}`);
        }
      });
    },
  };
}
