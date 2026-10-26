<script setup lang="ts">
/**
 * One headline number: a caption label over a monospaced metric, centred. The metric is the caller's slot so a stat can
 * be a value, a percentage or a formatted duration without this component knowing which.
 */
import Card from "@/client/components/layout/card.vue";
import CardContent from "@/client/components/layout/card-content.vue";

defineProps<{ label: string }>();
</script>

<template>
  <Card>
    <CardContent compact class="flex flex-col items-center justify-center gap-1.5 text-center">
      <div class="flex max-w-full min-w-0 items-center justify-center gap-1.5">
        <p class="min-w-0 ui-meta font-medium break-words md:truncate" v-tooltip="label">{{ label }}</p>
      </div>
      <div class="ui-metric"><slot /></div>
    </CardContent>
  </Card>
</template>
