import { defineStore } from "pinia";
import type { ThemeMode } from "@/shared/types";
import type { Lang } from "@/shared/i18n";
import { SETTINGS_STORAGE_VERSION, STORAGE_KEYS } from "@/shared/config";
import { readPersisted, safeStorage, writePersisted } from "@/client/stores/persist";

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
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function initialLang(): Lang {
  return (navigator.language ?? "").toLowerCase().startsWith("en") ? "en" : "zh";
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

let syncing = false;

export function initSettingsStorageSync(): void {
  if (syncing) return;
  syncing = true;
  const storage = safeStorage("local");
  const store = useSettingsStore();
  store.$subscribe(
    (_mutation, state) =>
      writePersisted(storage, STORAGE_KEYS.settings, VERSION, { themeMode: state.themeMode, lang: state.lang }),
    { detached: true },
  );
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEYS.settings || event.newValue == null) return;
    try {
      const parsed = JSON.parse(event.newValue) as { state?: PersistedSettings };
      const themeMode = parsed.state?.themeMode;
      const lang = parsed.state?.lang;
      if (isThemeMode(themeMode) && themeMode !== store.themeMode) store.themeMode = themeMode;
      if (isLang(lang) && lang !== store.lang) store.lang = lang;
    } catch (err) {
      console.warn(`[settings] ignoring malformed storage event: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
}
