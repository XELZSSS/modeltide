import { useMemo } from "react";
import { useSearchStore } from "@/client/stores";
import { matchTerm } from "@/shared/lib/match";

/**
 * Filters `data` by the global search term (case-insensitive substring/prefix).
 * Full-scan O(n) per keystroke; tables paginate (pageSize 8-20) so render cost
 * stays bounded, but 10k+ row datasets should add virtualization (e.g. virtua).
 */
export function useFilteredData<T>(data: T[], getFields: (x: T) => string[]): T[] {
  const term = useSearchStore((s) => s.searchTerm)
    .toLowerCase()
    .trim();
  return useMemo(() => {
    if (!term) return data;
    return data.filter(
      (x) =>
        matchTerm(
          getFields(x).map((f) => f.toLowerCase().trim()),
          term,
        ).matched,
    );
  }, [data, term, getFields]);
}
