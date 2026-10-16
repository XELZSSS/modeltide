<script setup lang="ts">
import SegmentedGroup from "@/client/components/segmented-group.vue";
import TabButton from "@/client/components/tab-button.vue";
import { nextRovingId } from "@/client/components/tabs";

const props = defineProps<{
  value: string;
  options: { value: string; label: string }[];
  label?: string;
  idPrefix: string;
}>();

const emit = defineEmits<{ change: [value: string] }>();

function onKeydown(event: KeyboardEvent): void {
  const nextId = nextRovingId(
    event,
    props.options.map((option) => ({ id: option.value })),
    props.value,
  );
  if (nextId == null) return;
  emit("change", nextId);
  document.getElementById(`setting-${props.idPrefix}-${nextId}`)?.focus();
}
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
      @click="emit('change', option.value)"
    >
      {{ option.label }}
    </TabButton>
  </SegmentedGroup>
</template>
