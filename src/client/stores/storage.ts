import { createJSONStorage } from "zustand/middleware";
import type { StateStorage } from "zustand/middleware";

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
    } catch {}
  },
  removeItem: (name) => {
    try {
      if (typeof window !== "undefined") getStorage().removeItem(name);
    } catch {}
  },
});

export const localJsonStorage = createJSONStorage(() => safeStorage(() => localStorage));
export const sessionJsonStorage = createJSONStorage(() => safeStorage(() => sessionStorage));
