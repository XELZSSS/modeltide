import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { srcAlias } from "./vite.shared.ts";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: srcAlias,
  },
  test: {
    environment: "node",
    // Fail-safe: vitest force-exits teardownTimeout ms after tests finish, so a
    // leaked handle can never leave the run hanging on an interactive terminal.
    teardownTimeout: 5000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      thresholds: { lines: 70, branches: 65, functions: 70, statements: 70 },
    },
    // Inline projects inherit the root config by default (plugins +
    // resolve.alias); each project only declares its own test scope.
    projects: [
      {
        test: {
          name: "client",
          include: ["src/client/**/*.{test,spec}.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["src/client/setup-tests.ts"],
        },
      },
      {
        test: {
          name: "server",
          include: ["src/server/**/*.{test,spec}.{ts,tsx}"],
          environment: "node",
        },
      },
      {
        test: {
          name: "shared",
          include: ["src/shared/**/*.{test,spec}.{ts,tsx}"],
          environment: "node",
        },
      },
      {
        test: {
          name: "worker",
          include: ["worker/**/*.{test,spec}.{ts,tsx}"],
          environment: "node",
        },
      },
    ],
  },
});
