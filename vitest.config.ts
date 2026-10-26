import { defineConfig } from "vitest/config";
import { srcAlias } from "./vite.shared.ts";

export default defineConfig({
  resolve: {
    alias: srcAlias,
  },
  test: {
    teardownTimeout: 5000,
    // One worker for the whole run: every suite here is a pure-function or store test that cleans up after
    // itself, and per-file isolation cost ~250ms of worker startup per file. Anything that starts relying on
    // a fresh module registry belongs behind its own `vi.resetModules()`.
    isolate: false,
    // Parsers were the original scope; client-side pure modules (search matching, paging, partial polling,
    // payload decoding), the shared formatters and the server contract layer carry the same regression risk.
    include: ["src/**/*.{test,spec}.ts"],
    // The file set is frozen: do not add *.test.ts / *.spec.ts files. Update an existing suite when a change alters
    // its expectations, and agree on new coverage with the maintainer first. See AGENTS.md.
  },
});
