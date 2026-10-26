<script setup lang="ts">
import { ChevronRight } from "@lucide/vue";
import { useTranslation } from "@/client/i18n";
import { useNavigation, usePrefetch } from "@/client/nav/navigation";
import Sheet from "@/client/components/ui/sheet.vue";
import SheetBody from "@/client/components/ui/sheet-body.vue";
import SheetHeader from "@/client/components/ui/sheet-header.vue";
import SafeLink from "@/client/components/ui/safe-link.vue";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const { mobileMore, isActive } = useNavigation();
const { t } = useTranslation();
const prefetch = usePrefetch();
</script>

<template>
  <Sheet :open="open" :label="t('navMore')" @close="emit('close')">
    <SheetBody>
      <SheetHeader :title="t('more')" @close="emit('close')" />

      <nav class="divide-y divide-border" :aria-label="t('navSecondary')">
        <SafeLink
          v-for="item in mobileMore"
          :key="item.path"
          :href="item.path"
          :aria-current="isActive(item) ? 'page' : undefined"
          :class="[
            'flex items-center justify-between gap-3 py-3 ui-motion focus-visible:bg-surface-hover focus-visible:outline-none',
            isActive(item) ? 'text-text-primary' : 'text-text-secondary hoverable:hover:bg-surface-hover',
          ]"
          @click="emit('close')"
          @touchstart="prefetch.touch(item.path)"
          @mouseenter="prefetch.hover(item.path)"
          @mouseleave="prefetch.cancel"
          @focus="prefetch.hover(item.path)"
          @blur="prefetch.cancel"
        >
          <span class="flex min-w-0 items-center gap-2">
            <span :class="isActive(item) ? 'shrink-0 text-text-primary' : 'shrink-0 text-text-secondary'">
              <component :is="item.icon" :size="18" aria-hidden="true" />
            </span>
            <span class="ui-body">{{ item.label }}</span>
          </span>
          <ChevronRight :size="16" class="shrink-0 text-text-tertiary" aria-hidden="true" />
        </SafeLink>
      </nav>
    </SheetBody>
  </Sheet>
</template>
