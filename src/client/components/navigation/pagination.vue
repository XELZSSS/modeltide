<script setup lang="ts">
/**
 * Previous/next paging with the page counter announced politely. It renders nothing for a single page, so a short list
 * does not grow a control that cannot do anything.
 */
import { ChevronLeft, ChevronRight } from "@lucide/vue";
import { useTranslation } from "@/client/i18n";
import Button from "@/client/components/ui/button.vue";

defineProps<{ page: number; totalPages: number }>();
const emit = defineEmits<{ change: [page: number] }>();

const { t } = useTranslation();
</script>

<template>
  <nav v-if="totalPages > 1" :aria-label="t('pagination')" class="flex items-center justify-center gap-3 pt-2">
    <Button
      variant="outline"
      size="icon"
      :aria-label="t('previousPage')"
      :disabled="page <= 1"
      @click="emit('change', page - 1)"
    >
      <ChevronLeft :size="16" />
    </Button>
    <span class="min-w-16 text-center ui-caption tabular-nums" aria-live="polite">{{ page }} / {{ totalPages }}</span>
    <Button
      variant="outline"
      size="icon"
      :aria-label="t('nextPage')"
      :disabled="page >= totalPages"
      @click="emit('change', page + 1)"
    >
      <ChevronRight :size="16" />
    </Button>
  </nav>
</template>
