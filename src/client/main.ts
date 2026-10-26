import { createApp } from "vue";
import { createPinia } from "pinia";
import { VueQueryPlugin } from "@tanstack/vue-query";
import App from "./app.vue";
import { router } from "./router";
import { queryClient } from "./api/query/client";
import { initBootstrap } from "./bootstrap";
import { installClientErrorReporting, reportClientError } from "./monitoring";
import { vTooltip } from "./directives/tooltip";
import "@/styles/globals.css";

installClientErrorReporting();

const app = createApp(App);

app.use(createPinia());
app.use(VueQueryPlugin, { queryClient });
app.use(router);

app.directive("tooltip", vTooltip);

app.config.errorHandler = (err, _instance, info) => {
  reportClientError("app.errorHandler", err, { info });
};

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");

/**
 * `isReady()` rejects when the *first* navigation fails, and mounting anyway is deliberate: the router has already
 * reported that failure through `onError`, the shell still has to render, and the reader can then navigate to a route
 * that resolves. Awaiting it unguarded would leave the app unmounted with a blank page.
 */
router.onError((err) => reportClientError("router", err));

// Mount *before* the first navigation resolves: the shell and its `Suspense` plate then paint while the route
// component's chunk is still in flight, instead of the reader waiting on a blank page for it. `RouterView` fills the
// plate the moment the navigation lands, and bootstrap still waits for it so the idle work below never competes with
// that chunk.
app.mount(root);

await router.isReady().catch((err: unknown) => reportClientError("router.isReady", err));

initBootstrap();
