<script setup lang="ts">
import SuspenseQuery from "@/client/router/suspense-query.vue";
import CompareContent from "./compare-content.vue";

defineProps<{ backTo: string; title: string }>();
</script>

<template>
  <SuspenseQuery>
    <CompareContent :back-to="backTo" :title="title">
      <template #default="slotProps"><slot :models="slotProps.models" /></template>
    </CompareContent>
  </SuspenseQuery>
</template>
