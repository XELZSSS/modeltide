import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Loader2, Search, X } from "lucide-react";
import { useTranslation } from "@/client/providers";
import { useSearchAllRankings } from "./useSearchAllRankings";
import { useSearchStore } from "@/client/stores";
import { useClickOutside, useListKeyboard } from "@/client/hooks";
import type { SearchResult } from "@/shared/types";
import { cn } from "@/client/utils";

/** Debounce for the local field -> global store sync. */
const DEBOUNCE_MS = 200;

/** Combobox search box with debounced query, keyboard navigation and click-outside close. */
export function SearchInput() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const listboxId = useId();
  const statusId = useId();

  const searchTerm = useSearchStore((s) => s.searchTerm);
  const setSearchTerm = useSearchStore((s) => s.setSearchTerm);
  // Single debounce point for search: local field -> global store 200ms.
  // useSearchAllRankings consumes the debounced store value directly.
  const [inputValue, setInputValue] = useState(searchTerm);
  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(inputValue), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [inputValue, setSearchTerm]);
  useEffect(() => setInputValue(searchTerm), [searchTerm]);

  const { results, isPending, isError } = useSearchAllRankings(searchTerm);

  // Clear the global term synchronously on select so the destination's
  // SearchableDataTable never renders one frame filtered by the stale term
  // (the route-change reset in useSearchResetOnNavigate stays as a backstop).
  const clearSearch = useCallback(() => {
    setSearchTerm("");
    setInputValue("");
  }, [setSearchTerm]);

  const handleSelect = useCallback(
    (idx: number) => {
      const r = results[idx];
      if (r) {
        clearSearch();
        navigate(r.link);
        setIsOpen(false);
      }
    },
    [results, navigate, clearSearch],
  );

  const { clampedIndex, setActiveIndex, handleKeyDown } = useListKeyboard(results.length, handleSelect, () => {
    setIsOpen(false);
    inputRef.current?.focus();
  });

  useClickOutside(containerRef, () => setIsOpen(false));

  function handleResultClick(result: SearchResult) {
    clearSearch();
    navigate(result.link);
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // WAI-APG combobox: ArrowDown opens the popup when closed.
    if (!isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      if (inputValue.length >= 2) setIsOpen(true);
      return;
    }
    if (!isOpen) return;
    handleKeyDown(e);
  }

  return (
    <div ref={containerRef} className="relative w-full sm:w-56">
      <label htmlFor={inputId} className="sr-only">
        {t("searchPlaceholder")}
      </label>
      <div className="flex items-center gap-1.5 border border-border rounded-lg bg-bg-card px-3 py-2 focus-within:border-text-tertiary">
        <Search size={14} className="text-text-secondary" aria-hidden="true" />
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={inputValue}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={clampedIndex >= 0 ? `${listboxId}-option-${clampedIndex}` : undefined}
          aria-autocomplete="list"
          aria-describedby={statusId}
          autoComplete="off"
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsOpen(e.target.value.length >= 2);
            setActiveIndex(-1);
          }}
          onFocus={() => {
            if (inputValue.length >= 2) setIsOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder={t("searchPlaceholder")}
          className="w-full text-sm bg-transparent outline-none text-text-primary placeholder:text-text-tertiary"
        />
        {inputValue && (
          <button
            type="button"
            aria-label={t("clear")}
            onClick={() => {
              // Sync-clear the global store too; debounced sync alone would leave
              // tables filtered by the stale term for one debounce window.
              clearSearch();
              setIsOpen(false);
              setActiveIndex(-1);
              inputRef.current?.focus();
            }}
            className="rounded p-0.5 hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <X size={14} className="text-text-secondary" />
          </button>
        )}
      </div>

      {isOpen && inputValue.length >= 2 && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute top-full left-0 right-0 mt-1.5 max-h-[28rem] overflow-y-auto overscroll-contain no-scrollbar bg-bg-card border border-border rounded-xl shadow-lg z-50 sm:w-72 animate-fade-in"
        >
          <div className="p-1">
            {isPending && results.length === 0 ? (
              <div className="flex items-center justify-center gap-2 p-3 text-sm text-text-secondary">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {t("searching")}
              </div>
            ) : isError && results.length === 0 ? (
              <div className="p-3 text-sm text-text-secondary" role="alert">
                {t("searchFailed")}
              </div>
            ) : results.length === 0 ? (
              <div className="p-3 text-sm text-text-secondary" role="status">
                {t("noResults")}
              </div>
            ) : (
              results.map((result, index) => (
                <button
                  key={`${result.source}-${result.id}`}
                  id={`${listboxId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={clampedIndex === index}
                  ref={(el) => {
                    // Keep the keyboard-focused option visible in the scrollable list.
                    if (clampedIndex === index && el) el.scrollIntoView({ block: "nearest" });
                  }}
                  className={cn(
                    "w-full text-left p-3 rounded-md transition-colors active:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
                    clampedIndex === index ? "bg-hover" : "hover:bg-hover",
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => handleResultClick(result)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-text-primary truncate">{result.name}</span>
                    {result.score != null && (
                      <span className="text-xs text-text-secondary ml-2 shrink-0 font-mono">
                        {result.score.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-text-secondary">{t(result.source)}</span>
                    {result.provider && <span className="text-xs text-text-secondary">{result.provider}</span>}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
      <div id={statusId} role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {isOpen && inputValue.length >= 2 && !isPending && t("searchResultsCount", { count: results.length })}
      </div>
    </div>
  );
}
