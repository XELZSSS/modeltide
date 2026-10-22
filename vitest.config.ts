import { defineConfig } from "vitest/config";
import { srcAlias } from "./vite.shared.ts";

export default defineConfig({
  resolve: {
    alias: srcAlias,
  },
  test: {
    environment: "node",
    teardownTimeout: 5000,
    // One worker for the whole run: every suite here is a pure-function or store test that cleans up after
    // itself, and per-file isolation cost ~250ms of worker startup per file. Anything that starts relying on
    // a fresh module registry belongs behind its own `vi.resetModules()`.
    isolate: false,
    // Parsers were the original scope; client-side pure modules (search matching, paging, partial polling,
    // payload decoding), the shared formatters and the server contract layer carry the same regression risk.
    include: ["src/server/**/*.{test,spec}.ts", "src/client/**/*.{test,spec}.ts", "src/shared/**/*.{test,spec}.ts"],
  },
});
