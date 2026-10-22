import { defineStore } from "pinia";
import { boundedRecord } from "@/client/utils/lru";

const MAX_REMEMBERED_ROUTES = 32;

export const useSearchStore = defineStore("search", {
  state: () => ({ terms: {} as Record<string, string> }),
  actions: {
    setTerm(route: string, term: string) {
      this.terms = boundedRecord(this.terms, route, term, MAX_REMEMBERED_ROUTES);
    },
  },
});
