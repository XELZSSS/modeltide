<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useSettingsStore } from "@/client/stores";
import { useTranslation } from "@/client/i18n";
import DesktopNav from "./desktop-nav.vue";
import MobileNav from "./mobile-nav.vue";
import ErrorBoundary from "@/client/components/feedback/error-boundary.vue";
import ContractSkewNotice from "@/client/components/feedback/contract-skew-notice.vue";
import { PAGE_GUTTER, PAGE_WIDTH } from "@/client/nav/layout";
import { THEME_COLORS } from "@/shared/config";
import { useScrollRestoreMain } from "@/client/hooks/use-scroll-restore";

const SettingsSheet = defineAsyncComponent(() => import("./settings-sheet.vue"));
const MobileMoreSheet = defineAsyncComponent(() => import("./mobile-more-sheet.vue"));

const route = useRoute();
const settings = useSettingsStore();
const { t } = useTranslation();

const openSheet = ref<"settings" | "more" | null>(null);
// Mount each sheet on first open, then keep it mounted so its exit transition can play. Keeping the
// closed sheets unmounted leaves their chunk and the shared focus-trap code out of the first load.
const settingsMounted = ref(false);
const moreMounted = ref(false);
watch(openSheet, (sheet) => {
  if (sheet === "settings") settingsMounted.value = true;
  if (sheet === "more") moreMounted.value = true;
});
const mainRef = ref<HTMLElement | null>(null);
const { recordScroll, restoreScroll } = useScrollRestoreMain(mainRef);

function closeSheet(): void {
  openSheet.value = null;
}

function applyTheme(): void {
  const dark = settings.themeMode === "dark";
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  const metas = document.querySelectorAll("meta[name='theme-color']");
  for (const meta of metas) meta.setAttribute("content", dark ? THEME_COLORS.dark : THEME_COLORS.light);
}

watch(() => settings.themeMode, applyTheme, { immediate: true, flush: "post" });

watch(
  () => route.fullPath,
  (now, was) => {
    openSheet.value = null;
    const pathOf = (fullPath: string): string => fullPath.split("?")[0]!.split("#")[0]!;
    if (pathOf(now) !== pathOf(was)) restoreScroll();
  },
  { flush: "post" },
);

let mainEl: HTMLElement | null = null;

onMounted(() => {
  mainEl = mainRef.value;
  mainEl?.addEventListener("scroll", recordScroll, { passive: true });
  restoreScroll();
});

onBeforeUnmount(() => {
  mainEl?.removeEventListener("scroll", recordScroll);
  mainEl = null;
});
</script>

<template>
  <div class="min-h-screen h-[100dvh] flex flex-col bg-bg-primary overflow-x-hidden pt-[env(safe-area-inset-top,0px)]">
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-bg-primary focus:border focus:border-border focus:text-sm focus:outline-none focus:ring-2 focus:ring-ring"
    >
      {{ t("skipToContent") }}
    </a>
    <DesktopNav @settings-open="openSheet = 'settings'" />
    <main
      ref="mainRef"
      id="main-content"
      tabindex="-1"
      :aria-label="t('mainContent')"
      class="flex-1 min-h-0 overflow-y-scroll overscroll-contain pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0 focus:outline-none"
    >
      <div :class="[PAGE_WIDTH, PAGE_GUTTER]">
        <ContractSkewNotice />
      </div>
      <slot />
    </main>
    <MobileNav @more-open="openSheet = 'more'" @settings-open="openSheet = 'settings'" />
    <ErrorBoundary v-if="settingsMounted" key="settings">
      <SettingsSheet :open="openSheet === 'settings'" @close="closeSheet" />
    </ErrorBoundary>
    <ErrorBoundary v-if="moreMounted" key="more">
      <MobileMoreSheet :open="openSheet === 'more'" @close="closeSheet" />
    </ErrorBoundary>
  </div>
</template>
