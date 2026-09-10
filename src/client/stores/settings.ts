"use client";
import { persist } from "zustand/middleware";
import { create } from "zustand";
import { useEffect } from "react";
import type { ThemeMode } from "@/shared/types";
import type { Lang } from "@/shared/i18n";
import { STORAGE_KEYS } from "@/shared/config";
import { localJsonStorage } from "@/client/stores/storage";

const toggleLang = (lang: Lang): Lang => (lang === "en" ? "zh" : "en");
const toggleThemeMode = (mode: ThemeMode): ThemeMode => (mode === "light" ? "dark" : "light");

/**
 * First-render theme, resolved from the same source as the pre-hydration
 * inline script in `index.html` (stored value → system preference).
 * Reading storage synchronously keeps the store, the painted `<html>` class
 * and the later persist rehydration on the same value, so there is no
 * SSR/client divergence and no dark↔light flash for returning visitors.
 */
function initialThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "light";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.settings);
    const stored = raw ? (JSON.parse(raw) as { state?: Partial<SettingsState> }).state?.themeMode : undefined;
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // Corrupt storage falls through to the system preference below.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

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
      themeMode: initialThemeMode(),
      lang: "zh",
      toggleTheme: () => set((s) => ({ themeMode: toggleThemeMode(s.themeMode) })),
      toggleLang: () => set((s) => ({ lang: toggleLang(s.lang) })),
      setLang: (lang) => set(() => ({ lang })),
      setThemeMode: (themeMode) => set(() => ({ themeMode })),
    }),
    {
      name: STORAGE_KEYS.settings,
      version: 1,
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

export function useThemeStorageSync(): void {
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== STORAGE_KEYS.settings || e.newValue == null) return;
      try {
        const parsed = JSON.parse(e.newValue) as { state?: Partial<{ themeMode: string; lang: string }> };
        const updates: Partial<{ themeMode: ThemeMode; lang: Lang }> = {};
        const foreignTheme = parsed.state?.themeMode;
        if (
          (foreignTheme === "dark" || foreignTheme === "light") &&
          useSettingsStore.getState().themeMode !== foreignTheme
        ) {
          updates.themeMode = foreignTheme;
        }
        const foreignLang = parsed.state?.lang;
        if ((foreignLang === "zh" || foreignLang === "en") && useSettingsStore.getState().lang !== foreignLang) {
          updates.lang = foreignLang;
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
