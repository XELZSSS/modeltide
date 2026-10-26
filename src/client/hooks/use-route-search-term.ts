import { computed, type ComputedRef } from "vue";
import { useRoute } from "vue-router";
import { useSearchStore } from "@/client/stores/search-store";

export function useRouteSearchTerm(): {
  term: ComputedRef<string>;
  path: ComputedRef<string>;
  setTerm: (term: string, at?: string) => void;
} {
  const route = useRoute();
  const store = useSearchStore();
  const pathname = computed(() => route.path);
  return {
    term: computed(() => store.terms[pathname.value] ?? ""),
    path: pathname,
    // `at` files a term under the route it was typed on rather than whichever route is current when the write lands: a
    // debounced term arriving after a navigation used to filter the page the reader had just moved to.
    setTerm: (term, at = pathname.value) => store.setTerm(at, term),
  };
}
