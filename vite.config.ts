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
    chunkSizeWarningLimit: 400,
    cssMinify: true,
    cssCodeSplit: true,
    reportCompressedSize: true,
    // No sourcemaps: lean deploy, no source leak via /assets/*.map.
    sourcemap: false,
    rollupOptions: {
      treeshake: true,
      output: {
        manualChunks(id: string) {
          // Server-only deps must never ship to the browser: isolate them so
          // any client import surfaces as a distinct server-only-violation
          // chunk (CI asserts it is absent from dist/client).
          if (id.includes("node_modules/hono") || id.includes("node_modules/fast-xml-parser")) {
            return "server-only-violation";
          }
          if (!id.includes("node_modules")) return;
          if (/node_modules\/(react|react-dom)(\/|$)/.test(id)) return "vendor-react";
          if (id.includes("react-router")) return "vendor-router";
          if (id.includes("chart.js") || id.includes("react-chartjs-2")) return "charts";
          if (id.includes("@tanstack/react-query")) return "query";
          // lucide-react folds into vendor-utils: its own chunk wastes a round-trip.
          if (id.includes("zustand")) return "state";
          if (id.includes("lucide-react") || id.includes("clsx") || id.includes("tailwind-merge"))
            return "vendor-utils";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
}));
