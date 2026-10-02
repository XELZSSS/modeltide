import { createApp } from "vue";
import { createPinia } from "pinia";
import { VueQueryPlugin } from "@tanstack/vue-query";
import App from "@/client/app.vue";
import { router } from "@/client/router";
import { queryClient } from "@/client/api/query-client";
import { initBootstrap } from "@/client/bootstrap";
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
app.mount(root);

initBootstrap();
