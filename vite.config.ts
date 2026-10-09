import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { consistencyGuard, cspHashGuard, serviceWorkerVersion } from "./build/vite-plugins.ts";
import { srcAlias } from "./vite.shared.ts";

export default defineConfig({
  plugins: [consistencyGuard(), vue(), tailwindcss(), serviceWorkerVersion(), cspHashGuard()],
  resolve: {
    alias: srcAlias,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
