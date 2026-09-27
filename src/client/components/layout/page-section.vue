<script setup lang="ts">
import { computed, useId } from "vue";
import { cn } from "@/client/utils/cn";

const props = defineProps<{ title?: string; description?: string; class?: string }>();

const headingId = useId();
const classes = computed(() => cn("my-8 sm:my-10 first:mt-0 last:mb-0", props.class));
</script>

<template>
  <div v-if="!title" :class="cn('my-8 sm:my-10', props.class)">
    <slot />
  </div>
  <section v-else :class="classes" :aria-labelledby="headingId">
    <div class="flex items-baseline justify-between gap-2 mb-4 sm:mb-6">
      <h2 :id="headingId" class="ui-section-title">{{ title }}</h2>
      <span v-if="description" class="ui-meta shrink-0">{{ description }}</span>
    </div>
    <slot />
  </section>
</template>
