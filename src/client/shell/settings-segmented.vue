<script setup lang="ts">
import SegmentedGroup from "@/client/components/segmented-group.vue";
import TabButton from "@/client/components/tab-button.vue";
import { useRovingRadio } from "@/client/components/tabs";

const props = defineProps<{
  value: string;
  options: { value: string; label: string }[];
  label?: string;
  idPrefix: string;
}>();

const emit = defineEmits<{ change: [value: string] }>();

const { tabIndexFor, onKeydown } = useRovingRadio({
  items: () => props.options.map((option) => option.value),
  activeId: () => props.value,
  elementId: (id) => `setting-${props.idPrefix}-${id}`,
  select: (id) => emit("change", id),
});
</script>

<template>
  <SegmentedGroup role="radiogroup" :aria-label="label" @click.stop @keydown="onKeydown">
    <TabButton
      v-for="option in options"
      :key="option.value"
      role="radio"
      size="sm"
      :active="value === option.value"
      :id="`setting-${idPrefix}-${option.value}`"
      :tab-index="tabIndexFor(option.value)"
      @click="emit('change', option.value)"
    >
      {{ option.label }}
    </TabButton>
  </SegmentedGroup>
</template>
