"use client";
import { createJSONStorage, type StateStorage } from "zustand/middleware";

const safeStorage = (getStorage: () => Storage): StateStorage => ({
  getItem: (name) => {
    try {
      return (typeof window === "undefined" ? null : getStorage().getItem(name)) ?? null;
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      if (typeof window !== "undefined") getStorage().setItem(name, value);
    } catch (err) {
      console.warn(`[storage] persist failed for "${name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  },
  removeItem: (name) => {
    try {
      if (typeof window !== "undefined") getStorage().removeItem(name);
    } catch {}
  },
});

export const localJsonStorage = createJSONStorage(() => safeStorage(() => localStorage));
export const sessionJsonStorage = createJSONStorage(() => safeStorage(() => sessionStorage));
