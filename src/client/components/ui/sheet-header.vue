<script setup lang="ts">
/** A sheet's title bar: the title (or a title slot) and the close button that emits `close`. */
import { X } from "@lucide/vue";
import { useTranslation } from "@/client/i18n";
import Button from "@/client/components/ui/button.vue";

defineProps<{ title?: string }>();
const emit = defineEmits<{ close: [] }>();

const { t } = useTranslation();
</script>

<template>
  <div class="flex items-center justify-between">
    <p class="ui-card-title">
      <slot>{{ title }}</slot>
    </p>
    <Button variant="ghost" size="icon" :aria-label="t('close')" @click="emit('close')">
      <X class="size-4" />
    </Button>
  </div>
</template>
