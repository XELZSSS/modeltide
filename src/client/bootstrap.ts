import { router } from "@/client/router";
import { initCompareStorageSync, initCostStorageSync, initSettingsStorageSync } from "@/client/stores";
import { registerServiceWorker, unregisterStaleServiceWorker } from "@/client/pwa/pwa-client";

function loadFonts(): void {
  if (!("fonts" in document)) return;
  void document.fonts.load('400 1em "IBM Plex Sans"');
  void document.fonts.load('600 1em "IBM Plex Sans"');
  void document.fonts.load('400 1em "IBM Plex Mono"');
}

function boot(): void {
  registerServiceWorker();
  unregisterStaleServiceWorker();
  if (router.resolve(window.location.pathname).name === "home") void import("@/client/utils/charts-register");
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
