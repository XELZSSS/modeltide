import path from "path";
import { fileURLToPath } from "url";

export const rootDir = path.dirname(fileURLToPath(import.meta.url));

export const srcAlias: Record<string, string> = {
  "@": path.resolve(rootDir, "src"),
};

export const SRC_ALIAS = "@";
export const SRC_DIR = "src";
export const CLIENT_OUT_DIR = "dist";
export const API_PREFIX = "/api";
export const FUNCTIONS_ROUTE = "/functions/api/[[route]].ts";
