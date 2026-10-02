<script setup lang="ts">
import { computed, ref, watch } from "vue";
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
      class="flex h-9 items-center gap-2 min-w-0 max-w-full ui-card px-3 transition-colors duration-fast focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-ring/30"
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

    <div
      v-if="isOpen && canSearch"
      :id="listboxId"
      :ref="setListEl"
      role="listbox"
      class="absolute top-full left-0 right-0 sm:left-auto sm:right-0 sm:w-72 sm:max-w-[calc(100vw-2rem)] mt-1.5 max-h-[28rem] overflow-y-auto overscroll-contain no-scrollbar ui-overlay z-40 animate-enter"
    >
      <div class="p-1.5"><slot /></div>
    </div>
    <div :id="statusId" role="status" aria-live="polite" aria-atomic="true" class="sr-only">
      {{ isOpen && canSearch ? status : "" }}
    </div>
  </div>
</template>
