import path from "path";
import { fileURLToPath } from "url";

// Shared by vite.config.ts and vitest.config.ts so the build and the test
// runner always resolve "@" to the same src directory.
const rootDir = path.dirname(fileURLToPath(import.meta.url));

export const srcAlias: Record<string, string> = {
  "@": path.resolve(rootDir, "src"),
};
