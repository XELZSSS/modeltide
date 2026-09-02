import type { StateStorage } from "zustand/middleware";

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
