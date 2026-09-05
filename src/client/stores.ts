import { type StateStorage, persist, createJSONStorage } from "zustand/middleware";
import { create } from "zustand";
import { useEffect, useMemo } from "react";
import type { ThemeMode, ArtificialAnalysisModel } from "@/shared/types";
import type { Lang } from "@/shared/i18n";
import { STORAGE_KEYS } from "@/shared/config";
import { modelId } from "@/client/utils";

// ---- storage ----
function guarded(storage: () => Storage): StateStorage {
  const get = (): Storage | null => {
    try {
      return typeof window === "undefined" ? null : storage();
    } catch {
      return null;
    }
  };
  return {
    getItem: (name) => {
      try {
        return get()?.getItem(name) ?? null;
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        get()?.setItem(name, value);
      } catch {
        // Quota exceeded or writes blocked: keep working in memory.
      }
    },
    removeItem: (name) => {
      try {
        get()?.removeItem(name);
      } catch {
        // Ignore removal failures for the same reasons as above.
      }
    },
  };
}

export function safeLocalStorage(): StateStorage {
  return guarded(() => localStorage);
}

export function safeSessionStorage(): StateStorage {
  return guarded(() => sessionStorage);
}

// ---- search ----
// Global search term used to filter list views.
interface SearchState {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  resetSearch: () => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  searchTerm: "",
  setSearchTerm: (term) => set({ searchTerm: term }),
  resetSearch: () => set({ searchTerm: "" }),
}));

// ---- settings ----
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

/**
 * Persisted settings (theme + language). Selectors keep consumers isolated:
 * a lang change does not re-render theme-only subscribers.
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Defaults follow the OS color scheme and Chinese; persisted choices win later.
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
      storage: createJSONStorage(safeLocalStorage),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn("[settings] rehydrate failed", error);
      },
      // Keeps defaults for absent keys; drops unknown/corrupt values.
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

/**
 * Cross-tab settings sync via the `storage` event. Mounted once (AppShell).
 */
export function useThemeStorageSync(): void {
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== STORAGE_KEYS.settings || e.newValue == null) return;
      try {
        const parsed = JSON.parse(e.newValue) as { state?: { themeMode?: ThemeMode; lang?: Lang } };
        const foreignTheme = parsed.state?.themeMode;
        if (foreignTheme === "dark" || foreignTheme === "light") {
          if (useSettingsStore.getState().themeMode !== foreignTheme) {
            useSettingsStore.setState({ themeMode: foreignTheme });
          }
        }
        const foreignLang = parsed.state?.lang;
        if (foreignLang === "zh" || foreignLang === "en") {
          if (useSettingsStore.getState().lang !== foreignLang) {
            useSettingsStore.setState({ lang: foreignLang });
          }
        }
      } catch (e) {
        console.warn("[settings] failed to sync foreign theme:", e);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
}

// ---- compare ----
// The compare view is limited to two models side by side.
const MAX_COMPARE = 2;

interface CompareState {
  compareIds: string[];
  lastExceedAt: number | null;
  toggleCompareModel: (model: ArtificialAnalysisModel) => boolean;
  removeCompareModel: (model: { id?: string; slug?: string }) => void;
  clearCompare: () => void;
  clearExceed: () => void;
}

export const useCompareStore = create<CompareState>()(
  persist(
    (set, get) => ({
      compareIds: [],
      lastExceedAt: null,
      toggleCompareModel: (model) => {
        const key = modelId(model);
        if (!key) return false;
        const state = get();
        if (state.compareIds.includes(key)) {
          set({ compareIds: state.compareIds.filter((id) => id !== key), lastExceedAt: null });
          return true;
        }
        if (state.compareIds.length >= MAX_COMPARE) {
          set({ lastExceedAt: Date.now() });
          return false;
        }
        set({ compareIds: [...state.compareIds, key], lastExceedAt: null });
        return true;
      },
      removeCompareModel: (model) =>
        set((state) => {
          const key = modelId(model);
          if (!key) return state;
          return { compareIds: state.compareIds.filter((id) => id !== key), lastExceedAt: null };
        }),
      clearCompare: () => set({ compareIds: [], lastExceedAt: null }),
      clearExceed: () => set({ lastExceedAt: null }),
    }),
    {
      name: STORAGE_KEYS.compare,
      // sessionStorage keeps the selection per-tab.
      storage: createJSONStorage(safeSessionStorage),
      partialize: (state) => ({ compareIds: state.compareIds }),
      // Validate persisted ids: drop non-strings, dedupe, enforce MAX_COMPARE.
      // Without this a hand-edited/legacy session value could inject 3+ ids.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { compareIds?: unknown };
        const raw = Array.isArray(p.compareIds) ? p.compareIds : [];
        const clean = Array.from(
          new Set(raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0)),
        ).slice(0, MAX_COMPARE);
        return { ...current, compareIds: clean };
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn("[compare] rehydrate failed", error);
      },
    },
  ),
);

/** Resolve compared ids to full models, preserving store order. */
export function useCompareModels(rankings: ArtificialAnalysisModel[]): ArtificialAnalysisModel[] {
  const compareIds = useCompareStore((s) => s.compareIds);
  const rankingMap = useMemo(() => {
    const map = new Map<string, ArtificialAnalysisModel>();
    for (const m of rankings) {
      const id = modelId(m);
      if (id) map.set(id, m);
    }
    return map;
  }, [rankings]);
  return useMemo(
    () => compareIds.map((id) => rankingMap.get(id)).filter((m): m is ArtificialAnalysisModel => !!m),
    [compareIds, rankingMap],
  );
}
