<script setup lang="ts">
import { computed } from "vue";
import { Languages, SunMoon } from "@lucide/vue";
import { useTranslation } from "@/client/i18n";
import { useSettingsStore } from "@/client/stores";
import Sheet from "@/client/components/ui/sheet.vue";
import SheetBody from "@/client/components/ui/sheet-body.vue";
import SheetHeader from "@/client/components/ui/sheet-header.vue";
import SettingsSegmented from "@/client/components/layout/settings-segmented.vue";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const { t, lang, setLang } = useTranslation();
const settings = useSettingsStore();

const languageOptions = computed(() => [
  { value: "zh", label: t("langZh") },
  { value: "en", label: t("langEn") },
]);

const themeOptions = computed(() => [
  { value: "light", label: t("themeLight") },
  { value: "dark", label: t("themeDark") },
]);
</script>

<template>
  <Sheet :open="open" :aria-label="t('settings')" @close="emit('close')">
    <SheetBody>
      <SheetHeader :title="t('settings')" @close="emit('close')" />

      <div class="divide-y divide-border">
        <div class="flex items-center justify-between gap-3 px-4 py-3">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-text-secondary shrink-0"><Languages :size="16" /></span>
            <p class="text-sm">{{ t("language") }}</p>
          </div>
          <SettingsSegmented
            :label="t('language')"
            id-prefix="language"
            :value="lang"
            :options="languageOptions"
            @change="(value) => (value === 'zh' || value === 'en') && setLang(value)"
          />
        </div>
        <div class="flex items-center justify-between gap-3 px-4 py-3">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-text-secondary shrink-0"><SunMoon :size="16" /></span>
            <p class="text-sm">{{ t("themeToggle") }}</p>
          </div>
          <SettingsSegmented
            :label="t('themeToggle')"
            id-prefix="theme"
            :value="settings.themeMode"
            :options="themeOptions"
            @change="(value) => (value === 'light' || value === 'dark') && settings.setThemeMode(value)"
          />
        </div>
      </div>
    </SheetBody>
  </Sheet>
</template>
