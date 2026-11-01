import { router } from "./router";
import { initCompareStorageSync, initCostStorageSync, initSettingsStorageSync } from "./stores";
import { registerServiceWorker, unregisterStaleServiceWorker } from "./pwa-client";
import { FONT_LOAD_SPECS } from "@/shared/pwa";
import { preloadChunk } from "./router/lazy-view";
import { loadMobileMoreSheet, loadSettingsSheet } from "./shell/sheet-loaders";

/** Idle work is warming, not startup: the timeout only bounds how long the browser may defer it. */
const IDLE_TIMEOUT_MS = 2000;

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

/** Runs `work` at idle, or right away where `requestIdleCallback` is missing (the Safari floor the build targets). */
export function whenIdle(work: () => void): void {
  if (typeof requestIdleCallback === "function") requestIdleCallback(work, { timeout: IDLE_TIMEOUT_MS });
  else work();
}

export function initBootstrap(): void {
  initSettingsStorageSync();
  initCompareStorageSync();
  initCostStorageSync();

  whenIdle(bootWhenLoaded);
}
