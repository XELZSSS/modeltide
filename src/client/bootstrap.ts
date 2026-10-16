import { router } from "./router";
import { initCompareStorageSync, initCostStorageSync, initSettingsStorageSync } from "./stores";
import { registerServiceWorker, unregisterStaleServiceWorker } from "./pwa-client";
import { FONT_LOAD_SPECS } from "@/shared/pwa";

function loadFonts(): void {
  if (!("fonts" in document)) return;
  for (const spec of FONT_LOAD_SPECS) void document.fonts.load(spec);
}

function boot(): void {
  registerServiceWorker();
  unregisterStaleServiceWorker();
  if (router.resolve(window.location.pathname).name === "home") void import("./charts/register");
  loadFonts();
}

function bootWhenLoaded(): void {
  if (document.readyState === "complete") boot();
  else window.addEventListener("load", boot, { once: true });
}

/** Kick off client-side boot tasks once the page is idle: storage sync, PWA, fonts, charts. */
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
