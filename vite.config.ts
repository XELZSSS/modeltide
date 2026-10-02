import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { cspHashGuard, serviceWorkerVersion } from "./build/vite-plugins.ts";
import { srcAlias } from "./vite.shared.ts";

export default defineConfig({
  plugins: [vue(), tailwindcss(), cloudflare(), serviceWorkerVersion(), cspHashGuard()],
  resolve: {
    alias: srcAlias,
  },
});
