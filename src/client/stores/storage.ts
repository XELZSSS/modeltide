import type { StateStorage } from "zustand/middleware";

export function safeLocalStorage(): StateStorage {
  return {
    getItem: (name) => localStorage.getItem(name),
    setItem: (name, value) => localStorage.setItem(name, value),
    removeItem: (name) => localStorage.removeItem(name),
  };
}

export function safeSessionStorage(): StateStorage {
  return {
    getItem: (name) => sessionStorage.getItem(name),
    setItem: (name, value) => sessionStorage.setItem(name, value),
    removeItem: (name) => sessionStorage.removeItem(name),
  };
}
