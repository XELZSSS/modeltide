<script setup lang="ts">
import { ChevronRight } from "@lucide/vue";
import { useTranslation } from "@/client/i18n";
import { usePathname } from "@/client/router";
import { isNavActive, useNavigation, usePrefetch } from "@/client/components/layout/navigation";
import Sheet from "@/client/components/ui/sheet.vue";
import SheetBody from "@/client/components/ui/sheet-body.vue";
import SheetHeader from "@/client/components/ui/sheet-header.vue";
import SafeLink from "@/client/components/safe-link.vue";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const pathname = usePathname();
const { mobileMore } = useNavigation();
const { t } = useTranslation();
const prefetch = usePrefetch();
</script>

<template>
  <Sheet :open="open" :aria-label="t('navMore')" @close="emit('close')">
    <SheetBody>
      <SheetHeader :title="t('more')" @close="emit('close')" />

      <nav class="divide-y divide-border" :aria-label="t('navSecondary')">
        <SafeLink
          v-for="item in mobileMore"
          :key="item.path"
          :href="item.path"
          :aria-current="isNavActive(pathname, item) ? 'page' : undefined"
          :class="[
            'flex items-center justify-between gap-3 px-4 py-3 transition-colors duration-fast focus-visible:outline-none focus-visible:bg-hover',
            isNavActive(pathname, item) ? 'text-accent' : 'text-text-primary hoverable:hover:bg-hover',
          ]"
          @click="emit('close')"
          @touchstart="prefetch.touch(item.path)"
          @mouseenter="prefetch.hover(item.path)"
          @mouseleave="prefetch.cancel"
          @focus="prefetch.hover(item.path)"
          @blur="prefetch.cancel"
        >
          <span class="flex items-center gap-2 min-w-0">
            <span :class="isNavActive(pathname, item) ? 'text-accent shrink-0' : 'text-text-secondary shrink-0'">
              <component :is="item.icon" :size="18" />
            </span>
            <span class="text-sm">{{ item.label }}</span>
          </span>
          <ChevronRight :size="16" class="text-text-tertiary shrink-0" aria-hidden="true" />
        </SafeLink>
      </nav>
    </SheetBody>
  </Sheet>
</template>
