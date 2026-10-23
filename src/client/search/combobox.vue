<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Search, X } from "@lucide/vue";
import { cn } from "@/client/utils/cn";
import Input from "@/client/components/ui/input.vue";
import { useTranslation } from "@/client/i18n";
import type { ComboboxController } from "./use-combobox";

const props = defineProps<{ controller: ComboboxController; status?: string; class?: string }>();

const { t } = useTranslation();

const {
  containerRef,
  inputRef,
  listRef,
  inputId,
  listboxId,
  statusId,
  inputValue,
  canSearch,
  isOpen,
  activeIndex,
  onChange,
  onFocus,
  onBlur,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  onClear,
} = props.controller;

const classes = computed(() => cn("relative w-full sm:w-72 min-w-0 max-w-full", props.class));

const clearClasses = computed(() =>
  cn(
    "shrink-0 p-1 hoverable:hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
    !inputValue.value && "invisible pointer-events-none",
  ),
);

const PANEL_MAX_PX = 448;
const PANEL_MIN_PX = 176;
const PANEL_GAP_PX = 6;
const PANEL_EDGE_PX = 8;

const panelStyle = ref<Record<string, string>>({});
let fitFrame = 0;

/**
 * The panel is clipped by the scrolling `<main>`, and on small screens the fixed bottom bar covers the same area,
 * so a long result list used to be cut off by the scrollport or painted over the bar. Capping the height to the room
 * that is actually left keeps the whole list reachable. The panel also sits at `z-20`: above page content (the
 * table's sticky column is `z-10`), below the nav bars (`z-30`) and the modal layer (`z-40`/`z-50`).
 */
function fitPanel(): void {
  const input = inputRef.value;
  if (!input) return;
  const clipBottom = Math.min(
    input.closest("main")?.getBoundingClientRect().bottom ?? window.innerHeight,
    window.innerHeight,
  );
  const barHeight = document.querySelector<HTMLElement>("[data-bottom-nav]")?.offsetHeight ?? 0;
  const room = clipBottom - barHeight - input.getBoundingClientRect().bottom - PANEL_GAP_PX - PANEL_EDGE_PX;
  const height = Math.max(PANEL_MIN_PX, Math.min(PANEL_MAX_PX, Math.round(room)));
  panelStyle.value = { maxHeight: `${height}px` };
}

function scheduleFit(): void {
  if (!isOpen.value || !canSearch.value || fitFrame !== 0) return;
  fitFrame = requestAnimationFrame(() => {
    fitFrame = 0;
    fitPanel();
  });
}

watch(
  [isOpen, canSearch],
  ([open, searchable]) => {
    if (open && searchable) scheduleFit();
  },
  { flush: "post" },
);

onMounted(() => {
  window.addEventListener("resize", scheduleFit, { passive: true });
  // `scroll` does not bubble, so capture it from whichever ancestor actually scrolls.
  window.addEventListener("scroll", scheduleFit, { passive: true, capture: true });
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", scheduleFit);
  window.removeEventListener("scroll", scheduleFit, { capture: true });
  if (fitFrame !== 0) cancelAnimationFrame(fitFrame);
});
const inputInstance = ref<InstanceType<typeof Input> | null>(null);

watch(
  inputInstance,
  (instance) => {
    inputRef.value = instance?.el ?? null;
  },
  { immediate: true },
);

function setContainerEl(el: unknown): void {
  containerRef.value = el instanceof HTMLDivElement ? el : null;
}

function setListEl(el: unknown): void {
  listRef.value = el instanceof HTMLDivElement ? el : null;
}
</script>

<template>
  <div :ref="setContainerEl" :class="classes">
    <label :for="inputId" class="sr-only">{{ t("searchPlaceholder") }}</label>
    <div
      class="flex h-9 items-center gap-2 min-w-0 max-w-full ui-card px-3 ui-motion focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-ring/30"
    >
      <Search :size="16" class="text-text-secondary shrink-0" aria-hidden="true" />
      <Input
        ref="inputInstance"
        :id="inputId"
        type="text"
        :model-value="inputValue"
        role="combobox"
        :aria-expanded="isOpen"
        :aria-controls="isOpen ? listboxId : undefined"
        :aria-activedescendant="activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined"
        aria-autocomplete="list"
        :aria-describedby="statusId"
        autocomplete="off"
        :placeholder="t('searchPlaceholder')"
        class="flex-1 border-0 bg-transparent px-0 h-full focus:border-transparent focus:ring-0"
        @update:model-value="onChange"
        @focus="onFocus"
        @blur="onBlur"
        @keydown="onKeyDown"
        @compositionstart="onCompositionStart"
        @compositionend="onCompositionEnd"
      />
      <button
        type="button"
        :aria-label="t('clear')"
        :aria-hidden="inputValue ? undefined : true"
        :tabindex="inputValue ? 0 : -1"
        :class="clearClasses"
        @click="onClear"
      >
        <X :size="14" class="text-text-secondary" />
      </button>
    </div>

    <Transition name="ui-pop">
      <div
        v-if="isOpen && canSearch"
        class="absolute top-full left-0 right-0 sm:left-auto sm:right-0 sm:w-72 sm:max-w-[calc(100vw-2rem)] mt-1.5 max-h-[28rem] overflow-y-auto overscroll-contain no-scrollbar ui-overlay z-20"
        :style="panelStyle"
      >
        <div class="p-1.5">
          <slot name="status" />
          <div :id="listboxId" :ref="setListEl" role="listbox">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
    <div :id="statusId" role="status" aria-live="polite" aria-atomic="true" class="sr-only">
      {{ isOpen && canSearch ? status : "" }}
    </div>
  </div>
</template>
