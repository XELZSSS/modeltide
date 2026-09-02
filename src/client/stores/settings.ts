import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useEffect } from "react";
import type { ThemeMode } from "@/shared/types";
import type { Lang } from "@/shared/i18n";
import { STORAGE_KEYS } from "@/shared/config";
import { safeLocalStorage } from "./storage";

interface ThemeState {
  themeMode: ThemeMode;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      // Default follows the OS color scheme; the persisted user choice overrides it later.
      themeMode:
        typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
      toggleTheme: () =>
        set((state) => ({
          themeMode: state.themeMode === "light" ? "dark" : "light",
        })),
    }),
    {
      name: STORAGE_KEYS.theme,
      storage: createJSONStorage(safeLocalStorage),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn("[theme] rehydrate failed", error);
      },
    },
  ),
);

/**
 * Cross-tab theme sync: when another tab persists a new themeMode, the
 * `storage` event fires here and we adopt the foreign state. Skips events from
 * this tab (e.target === window) and same-value writes. Mount once (AppShell).
 */
export function useThemeStorageSync(): void {
  const themeMode = useThemeStore((s) => s.themeMode);
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== STORAGE_KEYS.theme || e.newValue == null) return;
      try {
        const parsed = JSON.parse(e.newValue) as { state?: { themeMode?: ThemeMode } };
        const foreign = parsed.state?.themeMode;
        if ((foreign === "dark" || foreign === "light") && foreign !== themeMode) {
          useThemeStore.setState({ themeMode: foreign });
        }
      } catch (e) {
        console.warn("[settings] failed to sync foreign theme:", e);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [themeMode]);
}

interface LangState {
  lang: Lang;
  toggleLang: () => void;
}

export const useLangStore = create<LangState>()(
  persist(
    (set) => ({
      // Default to Chinese; the persisted choice wins on next load.
      lang: "zh",
      toggleLang: () => set((state) => ({ lang: state.lang === "en" ? "zh" : "en" })),
    }),
    {
      name: STORAGE_KEYS.lang,
      storage: createJSONStorage(safeLocalStorage),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn("[lang] rehydrate failed", error);
      },
    },
  ),
);
