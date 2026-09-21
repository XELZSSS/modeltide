"use client";
import { persist } from "zustand/middleware";
import { create } from "zustand";
import type { ThemeMode } from "@/shared/types";
import type { Lang } from "@/shared/i18n";
import { STORAGE_KEYS } from "@/shared/config";
import { localJsonStorage } from "@/client/stores/persist";

function readStoredSettings(): Partial<SettingsState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.settings);
    return raw ? ((JSON.parse(raw) as { state?: Partial<SettingsState> }).state ?? {}) : {};
  } catch {
    return {};
  }
}

const storedSettings = readStoredSettings();

function initialThemeMode(): ThemeMode {
  if (storedSettings.themeMode === "dark" || storedSettings.themeMode === "light") return storedSettings.themeMode;
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function initialLang(): Lang {
  if (typeof window === "undefined") return "zh";
  if (storedSettings.lang === "zh" || storedSettings.lang === "en") return storedSettings.lang;
  const nav = navigator.language ?? "";
  if (nav.toLowerCase().startsWith("en")) return "en";
  return "zh";
}

interface SettingsState {
  themeMode: ThemeMode;
  lang: Lang;
  setLang: (lang: Lang) => void;
  setThemeMode: (mode: ThemeMode) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: initialThemeMode(),
      lang: initialLang(),
      setLang: (lang) => set(() => ({ lang })),
      setThemeMode: (themeMode) => set(() => ({ themeMode })),
    }),
    {
      name: STORAGE_KEYS.settings,
      version: 1,
      storage: localJsonStorage,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          themeMode: p.themeMode === "dark" || p.themeMode === "light" ? p.themeMode : current.themeMode,
          lang: p.lang === "zh" || p.lang === "en" ? p.lang : current.lang,
        };
      },
    },
  ),
);
