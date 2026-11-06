<script setup lang="ts">
/**
 * The home route. The visible h1 and the first screen live in `home-content.vue`, which owns the payload they describe;
 * this file only supplies the page column and the suspense boundary, so a loading state never leaves a stray heading
 * above a screen that has not arrived yet.
 */
import PageContainer from "@/client/components/layout/page-container.vue";
import SuspenseQuery from "@/client/router/suspense-query.vue";
import HomeContent from "./home-content.vue";
</script>

<template>
  <PageContainer>
    <SuspenseQuery>
      <!-- The dashboard arranges itself a payload later than the route settles, so the page-level cross-fade in
           `app.vue` has already played out by the time these cards exist. The wrapper fades the content in when it
           actually mounts — the same `ui-anim-swap` every other page's data region uses. -->
      <div class="ui-anim-swap"><HomeContent /></div>
    </SuspenseQuery>
  </PageContainer>
</template>
