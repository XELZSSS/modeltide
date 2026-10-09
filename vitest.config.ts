import { defineConfig } from "vitest/config";
import { srcAlias } from "./vite.shared.ts";

export default defineConfig({
  resolve: {
    alias: srcAlias,
  },
  test: {
    environment: "node",
    teardownTimeout: 5000,
    projects: [
      {
        test: {
          name: "server",
          include: ["src/server/**/*.{test,spec}.ts"],
        },
      },
      {
        test: {
          name: "shared",
          include: ["src/shared/**/*.{test,spec}.ts"],
        },
      },
      {
        test: {
          name: "functions",
          include: ["functions/**/*.{test,spec}.ts"],
        },
      },
    ],
  },
});
