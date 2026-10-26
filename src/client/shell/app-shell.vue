<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useSettingsStore } from "@/client/stores";
import { useTranslation } from "@/client/i18n";
import DesktopNav from "./desktop-nav.vue";
import MobileNav from "./mobile-nav.vue";
import ErrorBoundary from "@/client/components/feedback/error-boundary.vue";
import { loadMobileMoreSheet, loadSettingsSheet } from "./sheet-loaders";
import ContractSkewNotice from "@/client/components/feedback/contract-skew-notice.vue";
import { PAGE_GUTTER, PAGE_WIDTH } from "@/client/nav/layout";
import { THEME_COLORS } from "@/shared/config";
import { useScrollRestoreMain } from "@/client/hooks/use-scroll-restore";

const SettingsSheet = defineAsyncComponent(loadSettingsSheet);
const MobileMoreSheet = defineAsyncComponent(loadMobileMoreSheet);

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

const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
const systemDark = ref(systemThemeQuery.matches);
const onSystemTheme = (event: MediaQueryListEvent): void => {
  systemDark.value = event.matches;
};
systemThemeQuery.addEventListener("change", onSystemTheme);
onBeforeUnmount(() => systemThemeQuery.removeEventListener("change", onSystemTheme));

/**
 * The setting is a preference, not a resolved colour: "system" follows the OS, which can change while the app is open, so
 * the shell watches the resolved value rather than the stored mode.
 */
const isDark = computed(() => (settings.themeMode === "system" ? systemDark.value : settings.themeMode === "dark"));

function applyTheme(): void {
  const dark = isDark.value;
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  const metas = document.querySelectorAll("meta[name='theme-color']");
  for (const meta of metas) meta.setAttribute("content", dark ? THEME_COLORS.dark : THEME_COLORS.light);
}

watch(isDark, applyTheme, { immediate: true, flush: "post" });

watch(
  () => route.fullPath,
  (now, was) => {
    openSheet.value = null;
    // Any navigation resets or restores the scroll, query included: a tab switch (`?tab=`, `?view=`) is a push onto a
    // new history entry with different content lengths, and comparing only the path left the viewport where the
    // previous tab had scrolled to.
    if (now !== was) restoreScroll();
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
  <!-- One fixed height, in `dvh`: `min-h-screen` alongside it resolved to `100vh`, which on a phone is the *large*
       viewport — taller than the visible area — so the shell outgrew the screen and pushed the bottom bar below the
       fold, reintroducing the page scroll the in-flow nav exists to avoid. -->
  <div class="flex h-[100dvh] flex-col overflow-x-hidden bg-bg-primary pt-[env(safe-area-inset-top,0px)]">
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:border focus:border-border focus:bg-bg-primary focus:px-4 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring focus:outline-none"
    >
      {{ t("skipToContent") }}
    </a>
    <DesktopNav @settings-open="openSheet = 'settings'" />
    <!-- No `scrollbar-gutter`: every scrollport hides its bar (see src/styles/scrollbar.css), so there is no strip and
         nothing to reserve — a `stable` gutter would have kept an empty 10px column and shifted the centred content.
         The x axis is still clipped explicitly: `overflow-y: auto` alone computes `overflow-x` to `auto` as well, which
         turned this column into a sideways-scrollable box. -->
    <main
      ref="mainRef"
      id="main-content"
      tabindex="-1"
      :aria-label="t('mainContent')"
      class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain focus:outline-none"
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
