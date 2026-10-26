<script setup lang="ts">
/**
 * A sheet's title bar: the title (or a title slot) and the close button that emits `close`.
 *
 * It stays in the body's normal flow — no sticky, no negative margins. `sheet-body` is a padded scroll box, so a
 * sticky bar there had to cancel the padding with negative margins to span the panel; the bar's own opaque box then
 * sat on top of the first row and covered it. The bar keeps the same inset as the rows instead, which cannot overlap
 * anything however long the list gets.
 */
import { X } from "@lucide/vue";
import { useTranslation } from "@/client/i18n";
import Button from "@/client/components/ui/button.vue";

defineProps<{ title?: string }>();
const emit = defineEmits<{ close: [] }>();

const { t } = useTranslation();
</script>

<template>
  <div class="flex items-center justify-between gap-3">
    <p class="ui-card-title">
      <slot>{{ title }}</slot>
    </p>
    <Button variant="ghost" size="icon" :aria-label="t('close')" @click="emit('close')">
      <X class="size-4" aria-hidden="true" />
    </Button>
  </div>
</template>
