import { useMemo } from "react";
import { useSearchStore } from "@/client/stores";
import { matchTerm } from "@/shared/lib/match";

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