import { defineStore } from "pinia";
import type { ThemeMode } from "@/shared/types";
import type { Lang } from "@/shared/i18n";
import { SETTINGS_STORAGE_VERSION, STORAGE_KEYS } from "@/shared/config";
import { initStorageSync, readPersisted, safeStorage } from "@/client/stores/persist";

const VERSION = SETTINGS_STORAGE_VERSION;

interface PersistedSettings {
  themeMode?: unknown;
  lang?: unknown;
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "dark" || value === "light";
}

function isLang(value: unknown): value is Lang {
  return value === "zh" || value === "en";
}

function initialThemeMode(): ThemeMode {
  try {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
  } catch {
    // ignore - fall through to default
  }
  return "light";
}

function initialLang(): Lang {
  try {
    const navLang = typeof navigator !== "undefined" ? (navigator.language ?? "") : "";
    return navLang.toLowerCase().startsWith("en") ? "en" : "zh";
  } catch {
    return "zh";
  }
}

function readSettings(): { themeMode: ThemeMode; lang: Lang } {
  const stored = readPersisted<PersistedSettings>(safeStorage("local"), STORAGE_KEYS.settings, VERSION);
  return {
    themeMode: isThemeMode(stored.themeMode) ? stored.themeMode : initialThemeMode(),
    lang: isLang(stored.lang) ? stored.lang : initialLang(),
  };
}

export const useSettingsStore = defineStore("settings", {
  state: readSettings,
  actions: {
    setLang(lang: Lang) {
      this.lang = lang;
    },
    setThemeMode(mode: ThemeMode) {
      this.themeMode = mode;
    },
  },
});

export function initSettingsStorageSync(): void {
  initStorageSync(useSettingsStore(), {
    storage: safeStorage("local"),
    key: STORAGE_KEYS.settings,
    version: VERSION,
    snapshot: (store) => ({ themeMode: store.themeMode, lang: store.lang }),
    onStorageEvent: (store, parsed) => {
      const state = (parsed as { state?: PersistedSettings }).state;
      const themeMode = state?.themeMode;
      const lang = state?.lang;
      if (isThemeMode(themeMode) && themeMode !== store.themeMode) store.themeMode = themeMode;
      if (isLang(lang) && lang !== store.lang) store.lang = lang;
    },
  });
}
