<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Search, X } from "@lucide/vue";
import { cn } from "@/client/utils/cn";
import Input from "@/client/components/ui/input.vue";
import { FOCUS_RING } from "@/client/components/ui/interactive-classes";
import { useTranslation } from "@/client/i18n";
import type { ComboboxController } from "./use-combobox";
import { usePanelFit } from "./use-panel-fit";
import { useOverflowShadow } from "@/client/hooks/use-overflow-shadow";

const props = defineProps<{ controller: ComboboxController; status?: string; class?: string }>();

const { t } = useTranslation();

const panelBody = ref<HTMLElement | null>(null);
const { moreBelow, measure: measurePanel } = useOverflowShadow(panelBody);

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

const classes = computed(() => cn("relative w-full max-w-full min-w-0 sm:w-72", props.class));

const clearClasses = computed(() =>
  cn(
    `shrink-0 rounded-md p-1 text-text-secondary ui-motion ${FOCUS_RING} hoverable:hover:bg-surface-hover hoverable:hover:text-text-primary`,
    !inputValue.value && "pointer-events-none invisible",
  ),
);

const inputInstance = ref<InstanceType<typeof Input> | null>(null);

watch(
  inputInstance,
  (instance) => {
    inputRef.value = instance?.el ?? null;
  },
  { immediate: true },
);

// The panel's geometry is measured from the input, so it is not this component's concern; see `use-panel-fit.ts`.
const { panelStyle } = usePanelFit({
  isOpen: () => isOpen.value,
  canSearch: () => canSearch.value,
  inputRef,
});

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
      class="flex h-10 max-w-full ui-card min-w-0 items-center gap-2 px-3 ui-motion focus-within:border-ring focus-within:ring-2 focus-within:ring-ring md:h-9"
    >
      <Search :size="16" class="shrink-0 text-text-secondary" aria-hidden="true" />
      <Input
        ref="inputInstance"
        :id="inputId"
        type="text"
        :model-value="inputValue"
        role="combobox"
        :aria-expanded="isOpen && canSearch"
        :aria-controls="isOpen && canSearch ? listboxId : undefined"
        :aria-activedescendant="activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined"
        aria-autocomplete="list"
        :aria-describedby="statusId"
        autocomplete="off"
        :placeholder="t('searchPlaceholder')"
        class="h-full flex-1 rounded-none border-0 bg-transparent px-0 focus:border-transparent focus-visible:bg-transparent focus-visible:ring-0 hoverable:hover:bg-transparent"
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
        class="absolute top-full right-0 left-0 z-20 mt-1.5 sm:right-0 sm:left-auto sm:w-72 sm:max-w-[calc(100vw-2rem)]"
      >
        <div
          ref="panelBody"
          class="max-h-[28rem] ui-overlay overflow-y-auto overscroll-contain"
          :style="panelStyle"
          @scroll.passive="measurePanel"
        >
          <div class="p-1.5">
            <slot name="status" />
            <div :id="listboxId" :ref="setListEl" role="listbox">
              <slot />
            </div>
          </div>
        </div>
        <!-- The bar is hidden app-wide, so the fade is what says "more results below"; it drops away at the end. -->
        <div
          v-if="moreBelow"
          aria-hidden="true"
          class="pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-xl bg-linear-to-t from-popover to-transparent"
        />
      </div>
    </Transition>
    <div :id="statusId" role="status" aria-live="polite" aria-atomic="true" class="sr-only">
      {{ isOpen && canSearch ? status : "" }}
    </div>
  </div>
</template>
