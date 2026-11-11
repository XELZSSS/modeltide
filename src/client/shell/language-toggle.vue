<script setup lang="ts">
/** The bar's language switch: a button that opens the two languages as a menu, with a tick on the one in use. A menu
 * rather than a toggle because `EN` reads equally well as "you are in English" and "press for English". The panel is the
 * project's popover (`ui-pop` over `ui-overlay`), anchored to the button's right edge so it stays inside the viewport. */
import { ref } from "vue";
import { Check, Languages } from "@lucide/vue";
import { useTranslation } from "@/client/i18n";
import { ICON_BUTTON } from "@/client/components/ui/interactive-classes";
import { useClickOutside } from "@/client/hooks/use-click-outside";
import { cn } from "@/client/utils/cn";
import type { Lang } from "@/shared/i18n";

const { t, lang, setLang } = useTranslation();
const open = ref(false);
const root = ref<HTMLElement | null>(null);

useClickOutside(root, () => {
  open.value = false;
});

const OPTIONS = [
  { value: "zh", label: "langZh" },
  { value: "en", label: "langEn" },
] as const satisfies readonly { value: Lang; label: "langZh" | "langEn" }[];

function choose(value: Lang): void {
  setLang(value);
  open.value = false;
}
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      :class="ICON_BUTTON"
      :aria-label="t('language')"
      aria-haspopup="menu"
      :aria-expanded="open"
      v-tooltip="t('language')"
      @click="open = !open"
    >
      <Languages :size="16" aria-hidden="true" />
    </button>

    <Transition name="ui-pop">
      <div
        v-if="open"
        class="absolute top-full right-0 z-30 mt-1.5 w-32 ui-overlay p-1"
        role="menu"
        :aria-label="t('language')"
        @keydown.escape="open = false"
      >
        <button
          v-for="option in OPTIONS"
          :key="option.value"
          type="button"
          role="menuitemradio"
          :aria-checked="lang === option.value"
          :class="
            cn(
              'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left ui-motion',
              lang === option.value
                ? 'text-text-primary'
                : 'text-text-secondary hoverable:hover:bg-surface-hover hoverable:hover:text-text-primary',
            )
          "
          @click="choose(option.value)"
        >
          <span class="ui-body">{{ t(option.label) }}</span>
          <Check v-if="lang === option.value" :size="14" aria-hidden="true" />
        </button>
      </div>
    </Transition>
  </div>
</template>
