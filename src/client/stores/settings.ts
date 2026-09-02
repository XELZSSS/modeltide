import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useEffect } from "react";
import type { ThemeMode } from "@/shared/types";
import type { Lang } from "@/shared/i18n";
import { STORAGE_KEYS } from "@/shared/config";
import { safeLocalStorage } from "./storage";

type LangToggle = (s: Lang) => Lang;
const toggleLang: LangToggle = (lang) => (lang === "en" ? "zh" : "en");
type ThemeToggle = (s: ThemeMode) => ThemeMode;
const toggleThemeMode: ThemeToggle = (mode) => (mode === "light" ? "dark" : "light");

interface SettingsState {
  themeMode: ThemeMode;
  lang: Lang;
  toggleTheme: () => void;
  toggleLang: () => void;
}

/**
 * Single persisted settings store (theme + language). Zustand selectors keep
 * consumers render-isolated: a lang change does not re-render theme-only
 * subscribers, so merging the two previously identical stores costs nothing.
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Default follows the OS color scheme; the persisted user choice overrides it later.
      themeMode:
        typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
      // Default to Chinese; the persisted choice wins on next load.
      lang: "zh",
      toggleTheme: () => set((s) => ({ themeMode: toggleThemeMode(s.themeMode) })),
      toggleLang: () => set((s) => ({ lang: toggleLang(s.lang) })),
    }),
    {
      name: STORAGE_KEYS.settings,
      storage: createJSONStorage(safeLocalStorage),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn("[settings] rehydrate failed", error);
      },
      // Merge strategy keeps defaults for keys absent from older persisted blobs.
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<SettingsState>) }),
    },
  ),
);

/**
 * Cross-tab theme sync: when another tab persists a new themeMode, the
 * `storage` event fires here and we adopt the foreign state. Skips events from
 * this tab (e.target === window) and same-value writes. Mount once (AppShell).
 */
export function useThemeStorageSync(): void {
  const themeMode = useSettingsStore((s) => s.themeMode);
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== STORAGE_KEYS.settings || e.newValue == null) return;
      try {
        const parsed = JSON.parse(e.newValue) as { state?: { themeMode?: ThemeMode } };
        const foreign = parsed.state?.themeMode;
        if ((foreign === "dark" || foreign === "light") && foreign !== themeMode) {
          useSettingsStore.setState({ themeMode: foreign });
        }
      } catch (e) {
        console.warn("[settings] failed to sync foreign theme:", e);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [themeMode]);
}
