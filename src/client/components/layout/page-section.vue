<script setup lang="ts">
/**
 * A titled block inside a page. With a title it renders a `section` element labelled by its own heading id; without one
 * it is a plain wrapper, so a section without a heading never claims a landmark a screen reader cannot name.
 */
import { useId } from "vue";

const props = defineProps<{ title?: string; class?: string }>();

const headingId = useId();
</script>

<template>
  <div v-if="!title" :class="props.class">
    <slot />
  </div>
  <section v-else :class="props.class" :aria-labelledby="headingId">
    <div class="mb-3 flex items-baseline justify-between gap-2 sm:mb-5">
      <h2 :id="headingId" class="ui-section-title">{{ title }}</h2>
    </div>
    <slot />
  </section>
</template>
