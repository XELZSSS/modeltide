import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    // Vitest 5 stable (was experimental.fsModuleCache): transformed modules
    // persist under node_modules across reruns/processes. No custom transform
    // plugins here (alias only), so no stale-cache risk. Clear with --clearCache.
    fsModuleCache: true,
    // Vitest 5: inline projects inherit root options (alias, environment) by
    // default and share one Vite server. Filter with `vitest -p <name>`.
    projects: [
      {
        test: {
          name: "client",
          include: ["src/client/**/*.{test,spec}.{ts,tsx}"],
        },
      },
      {
        test: {
          name: "server",
          include: ["src/server/**/*.{test,spec}.{ts,tsx}"],
        },
      },
    ],
  },
});
