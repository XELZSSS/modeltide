import { useEffect } from "react";
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

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "dark" || value === "light";
}

function isLang(value: unknown): value is Lang {
  return value === "zh" || value === "en";
}

function initialThemeMode(): ThemeMode {
  if (isThemeMode(storedSettings.themeMode)) return storedSettings.themeMode;
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function initialLang(): Lang {
  if (typeof window === "undefined") return "zh";
  if (isLang(storedSettings.lang)) return storedSettings.lang;
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
      // A version bump without migrate makes zustand destructure `undefined` and skip hydration.
      migrate: (persisted) => persisted as SettingsState,
      storage: localJsonStorage,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          themeMode: isThemeMode(p.themeMode) ? p.themeMode : current.themeMode,
          lang: isLang(p.lang) ? p.lang : current.lang,
        };
      },
    },
  ),
);

/** Adopts another tab's settings write; equal values must be ignored or the two tabs echo each other. */
function syncSettingsFromStorageEvent(e: StorageEvent): void {
  if (e.key !== STORAGE_KEYS.settings || e.newValue == null) return;
  try {
    const parsed = JSON.parse(e.newValue) as { state?: Partial<SettingsState> };
    const current = useSettingsStore.getState();
    const themeMode = parsed.state?.themeMode;
    const lang = parsed.state?.lang;
    const updates: Partial<Pick<SettingsState, "themeMode" | "lang">> = {};
    if (isThemeMode(themeMode) && themeMode !== current.themeMode) updates.themeMode = themeMode;
    if (isLang(lang) && lang !== current.lang) updates.lang = lang;
    if (Object.keys(updates).length > 0) useSettingsStore.setState(updates);
  } catch (err) {
    console.warn(`[settings] ignoring malformed storage event: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function useSettingsStorageSync(): void {
  useEffect(() => {
    window.addEventListener("storage", syncSettingsFromStorageEvent);
    return () => window.removeEventListener("storage", syncSettingsFromStorageEvent);
  }, []);
}
