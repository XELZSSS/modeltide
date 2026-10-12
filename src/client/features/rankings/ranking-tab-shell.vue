<script setup lang="ts">
import { assertPayloadShape } from "@/client/api/payload-normalize";
import TabStateShell from "@/client/components/data/tab-state-shell.vue";

interface TabListState {
  items: readonly unknown[];
  partial: boolean;
  malformed: boolean;
}

const props = defineProps<{ state: TabListState; domain: string }>();

assertPayloadShape(props.state.malformed, props.domain);
</script>

<template>
  <TabStateShell :state="props.state">
    <slot />
  </TabStateShell>
</template>
