import { useCallback, useMemo } from "react";
import { create } from "zustand";
import { usePathname } from "@/client/router";

interface SearchState {
  terms: Record<string, string>;
  setTerm: (route: string, term: string) => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  terms: {},
  setTerm: (route, term) => set((state) => ({ terms: { ...state.terms, [route]: term } })),
}));

/** The term belongs to the route that typed it: a view must never render with the previous
 *  view's term. Terms are kept for the session. */
export function useRouteSearchTerm(): { term: string; setTerm: (term: string) => void } {
  const pathname = usePathname();
  const term = useSearchStore((s) => s.terms[pathname] ?? "");
  const set = useSearchStore((s) => s.setTerm);
  const setTerm = useCallback((value: string) => set(pathname, value), [pathname, set]);
  return useMemo(() => ({ term, setTerm }), [term, setTerm]);
}
