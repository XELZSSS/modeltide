<script setup lang="ts">
import { computed } from "vue";
import { ChevronLeft, ChevronRight } from "@lucide/vue";
import { cn } from "@/client/utils/cn";
import { useTranslation } from "@/client/i18n";
import Button from "@/client/components/ui/button.vue";

const props = defineProps<{ page: number; totalPages: number; class?: string }>();
const emit = defineEmits<{ change: [page: number] }>();

const { t } = useTranslation();
const classes = computed(() => cn("flex items-center justify-center gap-3 pt-2", props.class));
</script>

<template>
  <nav v-if="totalPages > 1" :aria-label="t('pagination')" :class="classes">
    <Button variant="outline" size="icon" :aria-label="t('previousPage')" :disabled="page <= 1" @click="emit('change', page - 1)">
      <ChevronLeft :size="16" />
    </Button>
    <span class="ui-caption tabular-nums min-w-16 text-center" aria-live="polite">{{ page }} / {{ totalPages }}</span>
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
