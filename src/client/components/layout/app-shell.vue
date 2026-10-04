<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useSettingsStore } from "@/client/stores";
import { useTranslation } from "@/client/i18n";
import { historyIndex, isPopstateNavigation } from "@/client/router";
import DesktopNav from "@/client/components/layout/desktop-nav.vue";
import MobileNav from "@/client/components/layout/mobile-nav.vue";
import ErrorBoundary from "@/client/components/error-boundary.vue";
import SettingsSheet from "@/client/components/layout/settings-sheet.vue";
import MobileMoreSheet from "@/client/components/layout/mobile-more-sheet.vue";
import ContractSkewNotice from "@/client/components/feedback/contract-skew-notice.vue";
import { PAGE_GUTTER, PAGE_WIDTH } from "@/client/config/layout";
import { THEME_COLORS } from "@/shared/config";

const scrollOffsets = new Map<number, number>();

const SCROLL_RESTORE_WINDOW_MS = 5_000;

const route = useRoute();
const settings = useSettingsStore();
const { t } = useTranslation();

const openSheet = ref<"settings" | "more" | null>(null);
const mainRef = ref<HTMLElement | null>(null);

let stopRestore: (() => void) | null = null;

function closeSheet(): void {
  openSheet.value = null;
}

function recordScroll(): void {
  const main = mainRef.value;
  if (!main) return;
  scrollOffsets.set(historyIndex(), main.scrollTop);
}

function restoreScroll(): void {
  const main = mainRef.value;
  if (!main) return;
  stopRestore?.();
  stopRestore = null;
  const idx = historyIndex();
  if (!isPopstateNavigation()) {
    for (const key of scrollOffsets.keys()) if (key >= idx) scrollOffsets.delete(key);
    main.scrollTo({ top: 0 });
    return;
  }
  const target = scrollOffsets.get(idx) ?? 0;
  if (target === 0 || main.scrollHeight - main.clientHeight >= target) {
    main.scrollTo({ top: target });
    return;
  }
  const initial = main.scrollTop;
  let cancelled = false;
  const stop = () => {
    cancelled = true;
    clearTimeout(deadline);
    observer.disconnect();
    main.removeEventListener("scroll", onUserScroll);
  };
  const restore = () => {
    if (cancelled || main.scrollHeight - main.clientHeight < target) return;
    stop();
    main.scrollTo({ top: target });
  };
  const onUserScroll = () => {
    if (main.scrollTop !== initial) stop();
  };
  const observer = new MutationObserver(restore);
  const deadline = setTimeout(stop, SCROLL_RESTORE_WINDOW_MS);
  observer.observe(main, { childList: true, subtree: true });
  main.addEventListener("scroll", onUserScroll, { passive: true });
  stopRestore = stop;
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
  () => {
    openSheet.value = null;
    restoreScroll();
  },
  { flush: "post" },
);

onMounted(() => {
  mainRef.value?.addEventListener("scroll", recordScroll, { passive: true });
  restoreScroll();
});

onUnmounted(() => {
  mainRef.value?.removeEventListener("scroll", recordScroll);
  stopRestore?.();
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
      class="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable] overscroll-contain pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-4 focus:outline-none"
    >
      <div :class="[PAGE_WIDTH, PAGE_GUTTER]">
        <ContractSkewNotice />
      </div>
      <slot />
    </main>
    <MobileNav @more-open="openSheet = 'more'" @settings-open="openSheet = 'settings'" />
    <ErrorBoundary v-if="openSheet === 'settings'" key="settings">
      <SettingsSheet :open="true" @close="closeSheet" />
    </ErrorBoundary>
    <ErrorBoundary v-if="openSheet === 'more'" key="more">
      <MobileMoreSheet :open="true" @close="closeSheet" />
    </ErrorBoundary>
  </div>
</template>
