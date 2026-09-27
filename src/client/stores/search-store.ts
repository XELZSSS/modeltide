import { computed, type ComputedRef } from "vue";
import { defineStore } from "pinia";
import { useRoute } from "vue-router";

export const useSearchStore = defineStore("search", {
  state: () => ({ terms: {} as Record<string, string> }),
  actions: {
    setTerm(route: string, term: string) {
      this.terms = { ...this.terms, [route]: term };
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
