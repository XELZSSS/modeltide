import { createApp } from "vue";
import { createPinia } from "pinia";
import { VueQueryPlugin } from "@tanstack/vue-query";
import App from "./app.vue";
import { router } from "./router";
import { queryClient } from "./api/query-client";
import { initBootstrap } from "./bootstrap";
import "@/styles/globals.css";

const app = createApp(App);

app.use(createPinia());
app.use(VueQueryPlugin, { queryClient });
app.use(router);

app.config.errorHandler = (err, _instance, info) => {
  console.error("[app]", err, info);
};

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");

// Mount after the first navigation: lazy routes resolve async and would paint an empty RouterView; a failed navigation still mounts the shell.
void router
  .isReady()
  .catch(() => {})
  .then(() => {
    app.mount(root);
    initBootstrap();
  });
