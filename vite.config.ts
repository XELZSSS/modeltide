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
    chunkSizeWarningLimit: 600,
    cssMinify: true,
    cssCodeSplit: true,
    reportCompressedSize: true,
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
          if (id.includes("lucide-react")) return "icons";
          if (id.includes("zustand")) return "state";
          if (id.includes("clsx") || id.includes("tailwind-merge")) return "vendor-utils";
          if (id.includes("fast-xml-parser")) return "parser";
          if (id.includes("hono")) return "hono";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
}));