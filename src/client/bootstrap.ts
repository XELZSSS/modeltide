import { router } from "./router";
import { initCompareStorageSync, initCostStorageSync, initSettingsStorageSync } from "./stores";
import { registerServiceWorker, unregisterStaleServiceWorker } from "./pwa-client";
import { FONT_LOAD_SPECS } from "@/shared/pwa";
import { preloadChunk } from "./router/lazy-view";
import { loadMobileMoreSheet, loadSettingsSheet } from "./shell/sheet-loaders";

function loadFonts(): void {
  for (const spec of FONT_LOAD_SPECS) void document.fonts.load(spec);
}

function boot(): void {
  registerServiceWorker();
  unregisterStaleServiceWorker();
  if (router.resolve(window.location.pathname).name === "home") void import("./charts/register");
  // The sheets are mounted lazily on their first open; warming their chunk now keeps a cold first tap from waiting on
  // a round-trip with nothing on screen (see src/client/shell/sheet-loaders.ts).
  preloadChunk(loadSettingsSheet);
  preloadChunk(loadMobileMoreSheet);
  loadFonts();
}

function bootWhenLoaded(): void {
  if (document.readyState === "complete") boot();
  else window.addEventListener("load", boot, { once: true });
}

export function initBootstrap(): void {
  initSettingsStorageSync();
  initCompareStorageSync();
  initCostStorageSync();

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(bootWhenLoaded, { timeout: 2000 });
  } else {
    bootWhenLoaded();
  }
}
