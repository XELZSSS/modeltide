import { defineConfig } from "vitest/config";
import { srcAlias } from "./vite.shared.ts";

export default defineConfig({
  resolve: {
    alias: srcAlias,
  },
  test: {
    environment: "node",
    teardownTimeout: 5000,
    include: ["src/server/**/*.{test,spec}.ts"],
  },
});
