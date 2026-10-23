<script setup lang="ts">
import { useId } from "vue";

const props = defineProps<{ title?: string; class?: string }>();

const headingId = useId();
</script>

<template>
  <div v-if="!title" :class="props.class">
    <slot />
  </div>
  <section v-else :class="props.class" :aria-labelledby="headingId">
    <div class="flex items-baseline justify-between gap-2 mb-3 sm:mb-5">
      <h2 :id="headingId" class="ui-section-title">{{ title }}</h2>
    </div>
    <slot />
  </section>
</template>
