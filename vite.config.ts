import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { consistencyGuard } from "./build/consistency-guard.ts";
import { localApi } from "./build/local-api.ts";
import { serviceWorkerVersion } from "./build/sw-version.ts";
import { srcAlias } from "./vite.shared.ts";

export default defineConfig({
  plugins: [consistencyGuard(), vue(), tailwindcss(), localApi(), serviceWorkerVersion()],
  resolve: {
    alias: srcAlias,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  // Match production: let the local API middleware answer OPTIONS itself, not vite's dev CORS preflight handler.
  server: { cors: false },
});
