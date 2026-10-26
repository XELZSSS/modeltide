import path from "node:path";
import type { Plugin } from "vite";
import { errMsg } from "../src/shared/utils/text.ts";
import { rootDir } from "../vite.shared.ts";
import { checkConsistency, GUARD_WATCHES } from "./guards/index.ts";

/**
 * The consistency guard: rules that only a build can enforce, because none of them is visible to types, lint or the
 * suite. They live in `build/guards/`, one module per concern — the first paint's contract, the token/palette mirror,
 * the repository's structural and CPU-budget rules, and the files Cloudflare Pages parses at deploy time. Each rule
 * declares the paths whose change invalidates it; this file only decides *when* to run them.
 *
 * This module is deliberately thin: it holds the Vite hook wiring and nothing else, so adding a rule never means
 * editing the plugin lifecycle.
 */
export function consistencyGuard(): Plugin {
  let ranBuild = false;
  return {
    name: "modeltide:consistency",
    // Applies to `vite dev` as well as `vite build`: neither type-check nor lint evaluates these rules, so otherwise a
    // violation stays invisible until a production build runs. A build checks once — the inputs cannot change mid-build.
    buildStart() {
      if (ranBuild) return;
      if (this.environment?.name != null && this.environment.name !== "client") return;
      ranBuild = true;
      checkConsistency(rootDir);
    },
    /**
     * Dev re-checks on change. The rules read `theme.css`, `globals.css`, `index.html`, `sw.js` and the component tree,
     * none of which are modules the client graph imports, so a `buildStart`-only check left a running dev server
     * validating the files it started with. Failures are logged rather than thrown: the dev server has to stay up so the
     * fix can be made in place.
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
