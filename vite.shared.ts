import path from "path";
import { fileURLToPath } from "url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export const srcAlias: Record<string, string> = {
  "@": path.resolve(rootDir, "src"),
};
