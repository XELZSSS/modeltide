import { computed, type ComputedRef } from "vue";
import { defineStore } from "pinia";
import { useRoute } from "vue-router";

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

export function useRouteSearchTerm(): { term: ComputedRef<string>; setTerm: (term: string) => void } {
  const route = useRoute();
  const store = useSearchStore();
  const pathname = computed(() => route.path);
  return {
    term: computed(() => store.terms[pathname.value] ?? ""),
    setTerm: (term) => store.setTerm(pathname.value, term),
  };
}
