<script setup lang="ts">
import SegmentedGroup from "@/client/components/ui/segmented-group.vue";
import TabButton from "@/client/components/ui/tab-button.vue";
import { nextIndexForKey } from "@/client/components/ui/tabs";

const props = defineProps<{
  value: string;
  options: { value: string; label: string }[];
  label?: string;
  idPrefix: string;
}>();

const emit = defineEmits<{ change: [value: string] }>();

function onKeydown(event: KeyboardEvent): void {
  const next = nextIndexForKey(
    event.key,
    props.options.findIndex((option) => option.value === props.value),
    props.options.length,
  );
  if (next == null) return;
  event.preventDefault();
  const target = props.options[next];
  if (!target) return;
  emit("change", target.value);
  document.getElementById(`setting-${props.idPrefix}-${target.value}`)?.focus();
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
