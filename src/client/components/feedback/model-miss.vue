<script setup lang="ts">
/** The one place a model detail page decides how to report a row it could not find. A payload that arrived `partial` has
 * a legitimate reason to be missing a row, so calling that "this model does not exist" is a 404 that is not even true.
 * Four detail pages read this rule. */
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
