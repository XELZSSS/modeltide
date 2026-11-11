<script setup lang="ts">
/** The bar's theme switch, cycling the three modes the settings sheet offers: light → dark → system. "System" is in the
 * cycle because the bar is the only place a desktop reader can set it. The glyph names the mode on screen: a stored
 * "system" resolves to the OS preference, so the reader sees the shade they are actually looking at. */
import { computed } from "vue";
import { Moon, Sun, SunMoon } from "@lucide/vue";
import { useSettingsStore } from "@/client/stores";
import { useTranslation } from "@/client/i18n";
import { ICON_BUTTON } from "@/client/components/ui/interactive-classes";
import type { ThemeMode } from "@/shared/types";

const NEXT: Record<ThemeMode, ThemeMode> = { light: "dark", dark: "system", system: "light" };
const MODE_LABEL = { light: "themeLight", dark: "themeDark", system: "themeSystem" } as const;

const settings = useSettingsStore();
const { t } = useTranslation();

const label = computed(() => `${t("themeToggle")} · ${t(MODE_LABEL[settings.themeMode])}`);

function cycle(): void {
  settings.setThemeMode(NEXT[settings.themeMode]);
}
</script>

<template>
  <button type="button" :class="ICON_BUTTON" :aria-label="label" v-tooltip="label" @click="cycle">
    <Moon v-if="settings.themeMode === 'dark'" :size="16" aria-hidden="true" />
    <Sun v-else-if="settings.themeMode === 'light'" :size="16" aria-hidden="true" />
    <SunMoon v-else :size="16" aria-hidden="true" />
  </button>
</template>
