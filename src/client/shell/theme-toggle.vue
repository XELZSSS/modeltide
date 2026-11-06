<script setup lang="ts">
/**
 * The bar's theme switch, cycling the three modes the settings sheet offers: light → dark → system.
 *
 * It is a cycle rather than a light/dark flip because the bar is now the only place a desktop reader can set it — the
 * settings button that used to open the sheet is gone from the bar, and dropping "follow the system" from the cycle
 * would have quietly removed that option on a desktop.
 *
 * The glyph names the mode on screen: a stored "system" resolves to the OS preference, and the reader should see the
 * shade they are actually looking at, not the word "system".
 */
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

const mode = computed(() => settings.themeMode);
const label = computed(() => `${t("themeToggle")} · ${t(MODE_LABEL[mode.value])}`);

function cycle(): void {
  settings.setThemeMode(NEXT[mode.value]);
}
</script>

<template>
  <button type="button" :class="ICON_BUTTON" :aria-label="label" v-tooltip="label" @click="cycle">
    <Moon v-if="mode === 'dark'" :size="16" aria-hidden="true" />
    <Sun v-else-if="mode === 'light'" :size="16" aria-hidden="true" />
    <SunMoon v-else :size="16" aria-hidden="true" />
  </button>
</template>
