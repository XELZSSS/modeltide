import fs from "node:fs";
import path from "node:path";
import { rootDir } from "../vite.shared.ts";
import { CLIENT_OUT_DIR_NAME, FUNCTIONS_OUT } from "./constants.ts";

fs.rmSync(path.join(rootDir, CLIENT_OUT_DIR_NAME), { recursive: true, force: true });
fs.rmSync(path.join(rootDir, FUNCTIONS_OUT), { force: true });
