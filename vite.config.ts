import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { CLIENT_OUT_DIR_NAME } from "./build/constants.ts";
import { chunkBudget } from "./build/chunk-budget.ts";
import { consistencyGuard } from "./build/consistency-guard.ts";
import { localApi } from "./build/local-api.ts";
import { motionGuard } from "./build/motion-guard.ts";
import { serviceWorkerVersion } from "./build/sw-version.ts";
import { srcAlias } from "./vite.shared.ts";

export default defineConfig({
  plugins: [
    consistencyGuard(),
    motionGuard(),
    // @vue/compiler-sfc resolves imported prop/emit types through TypeScript's own `ts.sys`, so the plugin needs no
    // filesystem handed to it and `defineProps<ImportedType>()` compiles without extra wiring.
    vue(),
    tailwindcss(),
    localApi(),
    serviceWorkerVersion(),
    chunkBudget(),
  ],
  resolve: {
    alias: srcAlias,
  },
  build: {
    outDir: CLIENT_OUT_DIR_NAME,
    emptyOutDir: true,
  },
  // The API answers same-origin GET/HEAD only and ships no CORS headers, so keep vite's dev CORS layer off too.
  server: { cors: false },
});
