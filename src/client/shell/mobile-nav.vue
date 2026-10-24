<script setup lang="ts">
import { computed } from "vue";
import { MoreHorizontal, Settings } from "@lucide/vue";
import { useTranslation } from "@/client/i18n";
import { useNavigation, usePrefetch } from "@/client/nav/navigation";
import SafeLink from "@/client/components/ui/safe-link.vue";

const emit = defineEmits<{ moreOpen: []; settingsOpen: [] }>();

const { t } = useTranslation();
const { mobilePrimary, mobileMore, isActive } = useNavigation();
const { touch } = usePrefetch();

const BAR_BUTTON =
  "flex-1 flex flex-col items-center justify-center gap-1 text-center text-xs font-medium ui-motion ui-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring min-h-16 py-2";

// Selection is the raised pill behind the glyph, the same surface change the desktop segmented controls use.
const barItemClass = (active: boolean) =>
  `${BAR_BUTTON} relative ${active ? "text-text-primary" : "text-text-secondary"}`;

const iconWrapClass = (active: boolean) =>
  `inline-flex h-7 items-center justify-center rounded-lg px-3 ui-motion ${active ? "bg-surface-hover" : ""}`;

const isMoreActive = computed(() => mobileMore.value.some(isActive));
</script>

<template>
  <!--
    The bar is the shell's last flex row, not a `fixed` overlay. As a fixed box it painted over the scrollport, so on iOS —
    where a fixed bottom edge tracks the layout viewport while the toolbar collapses — content showed in the gap under it,
    and its 95% background let the page texture through. In flow it simply cannot overlap content, the scrollport ends
    above it, and the safe-area inset becomes padding that grows the bar instead of eating its height.
  -->
  <nav
    class="flex shrink-0 items-stretch border-t border-border bg-bg-primary pb-[env(safe-area-inset-bottom,0px)] md:hidden"
    :aria-label="t('navPrimaryMobile')"
  >
    <SafeLink
      v-for="item in mobilePrimary"
      :key="item.path"
      :href="item.path"
      :aria-label="item.label"
      :aria-current="isActive(item) ? 'page' : undefined"
      :class="barItemClass(isActive(item))"
      @touchstart="touch(item.path)"
    >
      <span :class="iconWrapClass(isActive(item))">
        <component :is="item.icon" :size="18" />
      </span>
      <span>{{ item.label }}</span>
    </SafeLink>
    <button type="button" :aria-label="t('more')" :class="barItemClass(isMoreActive)" @click="emit('moreOpen')">
      <span :class="iconWrapClass(isMoreActive)">
        <MoreHorizontal :size="18" />
      </span>
      <span>{{ t("more") }}</span>
    </button>
    <button type="button" :aria-label="t('settings')" :class="barItemClass(false)" @click="emit('settingsOpen')">
      <span :class="iconWrapClass(false)">
        <Settings :size="18" />
      </span>
      <span>{{ t("settings") }}</span>
    </button>
  </nav>
</template>
