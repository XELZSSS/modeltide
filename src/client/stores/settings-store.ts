import { defineStore } from "pinia";
import type { ThemeMode } from "@/shared/types";
import type { Lang } from "@/shared/i18n";
import { SETTINGS_STORAGE_VERSION, STORAGE_KEYS } from "@/shared/config";
import { loadPersistedState, makeStorageSync } from "./make-persisted-store";

const VERSION = SETTINGS_STORAGE_VERSION;

interface PersistedSettings {
  themeMode?: unknown;
  lang?: unknown;
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "system" || value === "dark" || value === "light";
}

function isLang(value: unknown): value is Lang {
  return value === "zh" || value === "en";
}

/**
 * Nothing persisted means "follow the OS" — the same preference `index.html` resolves for its first paint. It is a mode
 * and not a snapshot: `app-shell` re-resolves it every time the OS preference changes.
 */
const DEFAULT_THEME_MODE: ThemeMode = "system";

/**
 * The browser's own language, read only when nothing is persisted. Anything that is not an English tag gets the
 * Chinese copy, which is what `index.html` does too.
 */
function initialLang(): Lang {
  return navigator.language.toLowerCase().startsWith("en") ? "en" : "zh";
}

function readSettings(): { themeMode: ThemeMode; lang: Lang } {
  const stored = loadPersistedState<PersistedSettings>("local", STORAGE_KEYS.settings, VERSION);
  return {
    themeMode: isThemeMode(stored.themeMode) ? stored.themeMode : DEFAULT_THEME_MODE,
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

export const initSettingsStorageSync = makeStorageSync({
  useStore: useSettingsStore,
  kind: "local",
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
