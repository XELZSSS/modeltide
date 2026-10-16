<script setup lang="ts">
import { Loader2 } from "@lucide/vue";
import { useTranslation } from "@/client/i18n";

const { t } = useTranslation();
</script>

<template>
  <div class="flex items-center justify-center py-16" role="status" aria-live="polite">
    <Loader2 class="size-7 animate-spin text-accent" aria-hidden="true" />
    <span class="sr-only">{{ t("loading") }}</span>
  </div>
</template>
