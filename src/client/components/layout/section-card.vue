<script setup lang="ts">
import Card from "@/client/components/ui/card.vue";
import CardContent from "@/client/components/ui/card-content.vue";
import PageSection from "@/client/components/layout/page-section.vue";

defineProps<{ title: string }>();
</script>

<template>
  <PageSection :title="title">
    <Card>
      <CardContent><slot /></CardContent>
    </Card>
  </PageSection>
</template>
