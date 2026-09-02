import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/client/App";
import { registerServiceWorker } from "@/client/pwa/register-sw";
import "@/styles/globals.css";

function deferIdle(task: () => void): void {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => task(), { timeout: 2000 });
  } else {
    window.addEventListener("load", () => setTimeout(task, 0), { once: true });
  }
}

deferIdle(() => {
  registerServiceWorker();
  if ("fonts" in document) {
    void document.fonts.load('400 1em "Inter Variable"');
    void document.fonts.load('600 1em "Inter Variable"');
    void document.fonts.load('400 1em "JetBrains Mono Variable"');
  }
});

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root element is missing (index.html out of sync?)");
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
