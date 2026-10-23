import { existsSync, readFileSync, realpathSync } from "node:fs";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { consistencyGuard } from "./build/consistency-guard.ts";
import { localApi } from "./build/local-api.ts";
import { motionGuard } from "./build/motion-guard.ts";
import { serviceWorkerVersion } from "./build/sw-version.ts";
import { srcAlias } from "./vite.shared.ts";

// TypeScript 7 ships only the native `tsc` and exposes no compiler API, so
// @vue/compiler-sfc can no longer borrow `ts.sys` to statically resolve imported prop/emit
// types. Hand it an equivalent Node fs or every `defineProps<ImportedType>()` fails the build.
const SFC_TYPE_FS = {
  fileExists: (file: string) => existsSync(file),
  readFile: (file: string) => (existsSync(file) ? readFileSync(file, "utf-8") : undefined),
  realpath: (file: string) => realpathSync(file),
};

export default defineConfig({
  plugins: [
    consistencyGuard(),
    motionGuard(),
    vue({ script: { fs: SFC_TYPE_FS } }),
    tailwindcss(),
    localApi(),
    serviceWorkerVersion(),
  ],
  resolve: {
    alias: srcAlias,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  // The API answers same-origin GET/HEAD only and ships no CORS headers, so keep vite's dev CORS layer off too.
  server: { cors: false },
});
