<script setup lang="ts">
/**
 * The one place a model detail page decides how to report a row it could not find. A payload that arrived `partial`
 * has a legitimate reason to be missing a row — a capped source, a failed leg, a stale copy — so calling that "this
 * model does not exist" is a 404 the reader can do nothing about and that is not even true. Four detail pages read
 * this, so the rule lives here instead of four copies of the same ternary.
 */
import NotFound from "./not-found.vue";

const props = defineProps<{ partial: boolean }>();
</script>

<template>
  <NotFound
    heading-key="modelNotFoundTitle"
    :body-key="props.partial ? 'modelNotFoundPartial' : 'modelNotFound'"
    :code="null"
  />
</template>
