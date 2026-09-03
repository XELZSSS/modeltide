import { type StateStorage, persist, createJSONStorage } from "zustand/middleware";
import { create } from "zustand";
import { useEffect, useMemo } from "react";
import type { ThemeMode, ArtificialAnalysisModel } from "@/shared/types";
import type { Lang } from "@/shared/i18n";
import { STORAGE_KEYS } from "@/shared/config";
import { modelId } from "@/client/utils";

// ---- client/stores/storage.ts ----
function guarded(storage: () => Storage): StateStorage {
  const get = (): Storage | null => {
    try {
      return typeof window === "undefined" ? null : storage();
    } catch {
      // Private mode / disabled storage: accessing the property itself throws.
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
        // Quota exceeded or writes blocked: fail silently so the store still works in memory.
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

// ---- client/stores/search.ts ----
// Holds the global search term used to filter list views; resetSearch is a convenience
// wrapper that returns the term to its initial empty state.
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

// ---- client/stores/settings.ts ----
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
 * Single persisted settings store (theme + language). Zustand selectors keep
 * consumers render-isolated: a lang change does not re-render theme-only
 * subscribers.
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
      setLang: (lang) => set(() => ({ lang })),
      setThemeMode: (themeMode) => set(() => ({ themeMode })),
    }),
    {
      name: STORAGE_KEYS.settings,
      storage: createJSONStorage(safeLocalStorage),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn("[settings] rehydrate failed", error);
      },
      // Merge strategy keeps defaults for keys absent from older persisted blobs,
      // and drops unknown/corrupt values (e.g. {themeMode:"blue", lang:"fr"}).
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
 * Cross-tab settings sync: when another tab persists new settings, the
 * `storage` event fires here and we adopt the foreign state. Listener is
 * mounted once (AppShell); current values are read via getState() inside.
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

// ---- client/stores/compare.ts ----
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
      // sessionStorage keeps the selection per-tab instead of persisting it across sessions.
      storage: createJSONStorage(safeSessionStorage),
      partialize: (state) => ({ compareIds: state.compareIds }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn("[compare] rehydrate failed", error);
      },
    },
  ),
);

/**
 * Resolves the compared model ids from the compare store into full model objects
 * from the given Artificial Analysis rankings, preserving the store's order.
 */
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
