import type { StateStorage } from "zustand/middleware";
import { createJSONStorage } from "zustand/middleware";

function attempt<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function guarded(storage: () => Storage): StateStorage {
  const get = (): Storage | null => attempt(() => (typeof window === "undefined" ? null : storage()), null);
  return {
    getItem: (name) => attempt(() => get()?.getItem(name) ?? null, null),
    setItem: (name, value) => {
      attempt(() => get()?.setItem(name, value), undefined);
    },
    removeItem: (name) => {
      attempt(() => get()?.removeItem(name), undefined);
    },
  };
}

export function safeLocalStorage(): StateStorage {
  return guarded(() => localStorage);
}

export function safeSessionStorage(): StateStorage {
  return guarded(() => sessionStorage);
}

export const localJsonStorage = createJSONStorage(safeLocalStorage);

export const sessionJsonStorage = createJSONStorage(safeSessionStorage);
