<script setup lang="ts">
import { computed } from "vue";
import { MoreHorizontal, Settings } from "@lucide/vue";
import { useTranslation } from "@/client/i18n";
import { usePathname } from "@/client/router";
import { isNavActive, useNavigation, usePrefetch } from "@/client/components/layout/navigation";
import SafeLink from "@/client/components/safe-link.vue";

const emit = defineEmits<{ moreOpen: []; settingsOpen: [] }>();

const pathname = usePathname();
const { t } = useTranslation();
const { mobilePrimary, mobileMore } = useNavigation();
const { touch } = usePrefetch();

const BAR_BUTTON =
  "flex-1 flex flex-col items-center justify-center gap-1 text-center text-xs font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30 min-h-16 py-2";

const barItemClass = (active: boolean) => `${BAR_BUTTON} relative ${active ? "text-accent" : "text-text-secondary"}`;

const isMoreActive = computed(() => mobileMore.value.some((item) => isNavActive(pathname.value, item)));
</script>

<template>
  <nav
    class="md:hidden fixed left-0 right-0 bottom-0 z-30 flex h-16 items-stretch border-t border-border bg-bg-primary pb-[env(safe-area-inset-bottom,0px)]"
    :aria-label="t('navPrimaryMobile')"
  >
    <SafeLink
      v-for="item in mobilePrimary"
      :key="item.path"
      :href="item.path"
      :aria-label="item.label"
      :aria-current="isNavActive(pathname, item) ? 'page' : undefined"
      :class="barItemClass(isNavActive(pathname, item))"
      @touchstart="touch(item.path)"
    >
      <span v-if="isNavActive(pathname, item)" class="absolute top-0 left-1/4 right-1/4 h-0.5 bg-accent" aria-hidden="true" />
      <component :is="item.icon" :size="18" />
      <span>{{ item.label }}</span>
    </SafeLink>
    <button type="button" :aria-label="t('more')" :class="barItemClass(isMoreActive)" @click="emit('moreOpen')">
      <span v-if="isMoreActive" class="absolute top-0 left-1/4 right-1/4 h-0.5 bg-accent" aria-hidden="true" />
      <MoreHorizontal :size="18" />
      <span>{{ t("more") }}</span>
    </button>
    <button type="button" :aria-label="t('settings')" :class="barItemClass(false)" @click="emit('settingsOpen')">
      <Settings :size="18" />
      <span>{{ t("settings") }}</span>
    </button>
  </nav>
</template>
