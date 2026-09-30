import { createApp } from "vue";
import { createPinia } from "pinia";
import { VueQueryPlugin } from "@tanstack/vue-query";
import App from "@/client/app.vue";
import { router } from "@/client/router";
import { queryClient } from "@/client/api/query-client";
import { initCompareStorageSync, initCostStorageSync, initSettingsStorageSync } from "@/client/stores";
import { registerServiceWorker, unregisterStaleServiceWorker } from "@/client/pwa/pwa-client";
import "@/styles/globals.css";

const app = createApp(App);

app.use(createPinia());
app.use(VueQueryPlugin, { queryClient });
app.use(router);

app.config.errorHandler = (err, _instance, info) => {
  console.error("[app]", err, info);
};

initSettingsStorageSync();
initCompareStorageSync();
initCostStorageSync();

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");

app.mount(root);

const boot = (): void => {
  registerServiceWorker();
  unregisterStaleServiceWorker();
  void import("@/client/components/layout/settings-sheet.vue");
  void import("@/client/components/layout/mobile-more-sheet.vue");
  if (router.resolve(window.location.pathname).name === "home") void import("@/client/utils/charts-register");
  if ("fonts" in document) {
    void document.fonts.load('400 1em "IBM Plex Sans"');
    void document.fonts.load('600 1em "IBM Plex Sans"');
    void document.fonts.load('400 1em "IBM Plex Mono"');
  }
};

const bootWhenLoaded = (): void => {
  if (document.readyState === "complete") boot();
  else window.addEventListener("load", boot, { once: true });
};

if (typeof requestIdleCallback === "function") {
  requestIdleCallback(bootWhenLoaded, { timeout: 2000 });
} else {
  bootWhenLoaded();
}
