import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
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
    // Vitest 4: inline projects do NOT inherit the root config by default;
    // `extends: true` opts each project into the root plugins + resolve.alias.
    projects: [
      {
        extends: true,
        test: {
          name: "client",
          include: ["src/client/**/*.{test,spec}.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["src/client/setup-tests.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "server",
          include: ["src/server/**/*.{test,spec}.{ts,tsx}"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "shared",
          include: ["src/shared/**/*.{test,spec}.{ts,tsx}"],
          environment: "node",
        },
      },
    ],
  },
});
