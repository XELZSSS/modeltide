import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/client/App";
import "@/styles/globals.css";

// Warm the webfont cache to avoid a fallback-font flash on first paint.
if ("fonts" in document) {
  void document.fonts.load('400 1em "Inter Variable"');
  void document.fonts.load('600 1em "Inter Variable"');
  void document.fonts.load('400 1em "JetBrains Mono Variable"');
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root element is missing (index.html out of sync?)");
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
