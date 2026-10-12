import { computed, type ComputedRef } from "vue";
import { useRoute } from "vue-router";
import { useSearchStore } from "@/client/stores/search-store";

export function useRouteSearchTerm(): { term: ComputedRef<string>; setTerm: (term: string) => void } {
  const route = useRoute();
  const store = useSearchStore();
  const pathname = computed(() => route.path);
  return {
    term: computed(() => store.terms[pathname.value] ?? ""),
    setTerm: (term) => store.setTerm(pathname.value, term),
  };
}
