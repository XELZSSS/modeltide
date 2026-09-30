<script setup lang="ts">
import { defineComponent, h, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useSettingsStore } from "@/client/stores";
import { useTranslation } from "@/client/i18n";
import { historyIndex, isPopstateNavigation } from "@/client/router";
import { loadableView } from "@/client/router/lazy-view";
import DesktopNav from "@/client/components/layout/desktop-nav.vue";
import MobileNav from "@/client/components/layout/mobile-nav.vue";
import ErrorBoundary from "@/client/components/error-boundary.vue";

const loadSettingsSheet = () => import("@/client/components/layout/settings-sheet.vue");
const loadMobileMoreSheet = () => import("@/client/components/layout/mobile-more-sheet.vue");

const SettingsSheet = loadableView(loadSettingsSheet);
const MobileMoreSheet = loadableView(loadMobileMoreSheet);

const SheetSkeleton = defineComponent({
  setup: () => () =>
    h("div", { class: "fixed inset-0 z-50 flex items-end justify-center sm:items-center", "aria-hidden": "true" }, [
      h("div", { class: "fixed inset-0 bg-black/50" }),
      h("div", { class: "relative z-50 w-full max-w-md ui-overlay p-5" }, [
        h("div", { class: "h-4 w-24 ui-skeleton" }),
        h("div", { class: "mt-5 flex flex-col gap-3" }, [
          h("div", { class: "h-9 w-full ui-skeleton" }),
          h("div", { class: "h-9 w-full ui-skeleton" }),
          h("div", { class: "h-9 w-full ui-skeleton" }),
        ]),
      ]),
    ]),
});

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
  for (const meta of metas) meta.setAttribute("content", dark ? "#1a1a1a" : "#fafbfc");
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
      <slot />
    </main>
    <MobileNav @more-open="openSheet = 'more'" @settings-open="openSheet = 'settings'" />
    <ErrorBoundary v-if="openSheet === 'settings'" key="settings">
      <SettingsSheet :open="true" @close="closeSheet" />
      <template #fallback>
        <SheetSkeleton />
      </template>
    </ErrorBoundary>
    <ErrorBoundary v-if="openSheet === 'more'" key="more">
      <MobileMoreSheet :open="true" @close="closeSheet" />
      <template #fallback>
        <SheetSkeleton />
      </template>
    </ErrorBoundary>
  </div>
</template>
