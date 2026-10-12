import { defineStore } from "pinia";

export { useRouteSearchTerm } from "@/client/hooks/use-route-search-term";

const MAX_REMEMBERED_ROUTES = 32;

export const useSearchStore = defineStore("search", {
  state: () => ({ terms: {} as Record<string, string> }),
  actions: {
    setTerm(route: string, term: string) {
      const next = { ...this.terms, [route]: term };
      const keys = Object.keys(next);
      if (keys.length > MAX_REMEMBERED_ROUTES) {
        // Records iterate in insertion order — drop the oldest routes.
        const kept = keys.slice(keys.length - MAX_REMEMBERED_ROUTES);
        this.terms = Object.fromEntries(kept.map((key) => [key, next[key]!]));
      } else {
        this.terms = next;
      }
    },
  },
});
