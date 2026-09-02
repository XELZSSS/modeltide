import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => ({
  plugins: [tailwindcss(), react(), cloudflare()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 3000,
    hmr: { overlay: true },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-router", "@tanstack/react-query", "zustand", "chart.js"],
  },
  build: {
    target: "es2022",
    // 400kB warning threshold (Rollup default is 500): keeps new heavy deps visible.
    // Vite empties outDir on build, so no manual `rimraf dist` is needed before `npm run build`.
    chunkSizeWarningLimit: 400,
    cssMinify: true,
    cssCodeSplit: true,
    reportCompressedSize: true,
    // No sourcemaps by design: keeps the deploy lean and avoids leaking source
    // context via /assets/*.map. Observability stack traces stay unmapped;
    // switch to "hidden" + upload maps to a tracker if symbolication is needed.
    sourcemap: false,
    rollupOptions: {
      treeshake: true,
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          if (/node_modules\/(react|react-dom)(\/|$)/.test(id)) return "vendor-react";
          if (id.includes("react-router")) return "vendor-router";
          if (id.includes("chart.js") || id.includes("react-chartjs-2")) return "charts";
          if (id.includes("@tanstack/react-query")) return "query";
          // lucide-react (~6.8kB after tree-shaking) is folded into vendor-utils:
          // a standalone icons chunk would waste an HTTP round-trip for no caching win.
          if (id.includes("zustand")) return "state";
          if (id.includes("lucide-react") || id.includes("clsx") || id.includes("tailwind-merge"))
            return "vendor-utils";
          if (id.includes("fast-xml-parser")) return "parser";
          // NOTE: hono is server-only and must never be imported by client code;
          // there is intentionally no chunk rule for it (an import would surface
          // as unexpected bundle growth, not a tidy separate chunk).
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
}));
