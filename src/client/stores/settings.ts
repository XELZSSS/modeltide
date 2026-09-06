import { persist } from "zustand/middleware";
import { create } from "zustand";
import { useEffect } from "react";
import type { ThemeMode } from "@/shared/types";
import type { Lang } from "@/shared/i18n";
import { STORAGE_KEYS } from "@/shared/config";
import { localJsonStorage } from "@/client/stores/storage";

type LangToggle = (s: Lang) => Lang;
const toggleLang: LangToggle = (lang) => (lang === "en" ? "zh" : "en");
type ThemeToggle = (s: ThemeMode) => ThemeMode;
const toggleThemeMode: ThemeToggle = (mode) => (mode === "light" ? "dark" : "light");

interface SettingsState {
  themeMode: ThemeMode;
  lang: Lang;
  toggleTheme: () => void;
  toggleLang: () => void;
  setLang: (lang: Lang) => void;
  setThemeMode: (mode: ThemeMode) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode:
        typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
      lang: "zh",
      toggleTheme: () => set((s) => ({ themeMode: toggleThemeMode(s.themeMode) })),
      toggleLang: () => set((s) => ({ lang: toggleLang(s.lang) })),
      setLang: (lang) => set(() => ({ lang })),
      setThemeMode: (themeMode) => set(() => ({ themeMode })),
    }),
    {
      name: STORAGE_KEYS.settings,
      storage: localJsonStorage,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn("[settings] rehydrate failed", error);
      },
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

const SYNCED_FIELDS = [
  { key: "themeMode", valid: ["dark", "light"], get: () => useSettingsStore.getState().themeMode },
  { key: "lang", valid: ["zh", "en"], get: () => useSettingsStore.getState().lang },
] as const;

export function useThemeStorageSync(): void {
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== STORAGE_KEYS.settings || e.newValue == null) return;
      try {
        const parsed = JSON.parse(e.newValue) as {
          state?: Partial<Record<(typeof SYNCED_FIELDS)[number]["key"], string>>;
        };
        const updates: Partial<{ themeMode: ThemeMode; lang: Lang }> = {};
        for (const field of SYNCED_FIELDS) {
          const foreign = parsed.state?.[field.key];
          if (foreign != null && (field.valid as readonly string[]).includes(foreign) && field.get() !== foreign) {
            updates[field.key] = foreign as never;
          }
        }
        if (Object.keys(updates).length > 0) useSettingsStore.setState(updates);
      } catch (err) {
        console.warn("[settings] failed to sync foreign theme:", err);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
}
