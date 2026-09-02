import { useEffect } from "react";
import { useLocation } from "react-router";
import { useSearchStore } from "@/client/stores";

/** Clears the global search term whenever the URL path changes. */
export function useSearchResetOnNavigate() {
  const location = useLocation();
  const resetSearch = useSearchStore((s) => s.resetSearch);

  useEffect(() => {
    resetSearch();
  }, [location.pathname, resetSearch]);
}
