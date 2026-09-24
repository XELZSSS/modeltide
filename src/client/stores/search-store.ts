import { useCallback, useMemo } from "react";
import { create } from "zustand";
import { usePathname } from "@/client/router";

interface SearchState {
  terms: Record<string, string>;
  setTerm: (route: string, term: string) => void;
}

const useSearchStore = create<SearchState>((set) => ({
  terms: {},
  setTerm: (route, term) => set((state) => ({ terms: { ...state.terms, [route]: term } })),
}));

export function useRouteSearchTerm(): { term: string; setTerm: (term: string) => void } {
  const pathname = usePathname();
  const term = useSearchStore((s) => s.terms[pathname] ?? "");
  const set = useSearchStore((s) => s.setTerm);
  const setTerm = useCallback((value: string) => set(pathname, value), [pathname, set]);
  return useMemo(() => ({ term, setTerm }), [term, setTerm]);
}
