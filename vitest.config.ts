import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      // Provide KV for tests even when wrangler.jsonc has no kv_namespaces (optional KV mode)
      // Docs: https://developers.cloudflare.com/workers/testing/vitest-integration/configuration/
      // miniflare.kvNamespaces overrides wrangler config and ensures env.CACHE is available in tests
      miniflare: {
        kvNamespaces: ["CACHE"],
      },
    }),
  ],
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Coverage is intentionally unthresholded: `vitest run` stays green without
    // @vitest/coverage-v8 installed. To enforce, add the provider dep and e.g.
    // coverage: { provider: "v8", thresholds: { lines: 50, branches: 40 } }.
  },
});
