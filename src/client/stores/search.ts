import { create } from "zustand";

// Holds the global search term used to filter list views; resetSearch is a convenience
// wrapper that returns the term to its initial empty state.
interface SearchState {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  resetSearch: () => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  searchTerm: "",
  setSearchTerm: (term) => set({ searchTerm: term }),
  resetSearch: () => set({ searchTerm: "" }),
}));
