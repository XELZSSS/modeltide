import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/client/utils/cn";
import { useTranslation } from "@/client/providers";
import { useSearchStore } from "@/client/stores";
import type { SearchResult } from "@/shared/types";
import { useSearchAllRankings } from "@/client/search/use-search";
import { useClickOutside, useListKeyboard } from "@/client/search/interaction";

const DEBOUNCE_MS = 200;

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
  const location = useLocation();
  const [inputValue, setInputValue] = useState(searchTerm);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setInputValue("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);
  useEffect(() => {
    if (inputValue === searchTerm) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setSearchTerm(inputValue);
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [inputValue, searchTerm, setSearchTerm]);
  useEffect(() => setInputValue(searchTerm), [searchTerm]);
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const { results, isPending, isError } = useSearchAllRankings(searchTerm, { suspended: !isOpen });

  const clearSearch = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setSearchTerm("");
    setInputValue("");
  }, [setSearchTerm]);

  const goToResult = useCallback(
    (result: SearchResult | undefined) => {
      if (!result) return;
      clearSearch();
      navigate(result.link);
      setIsOpen(false);
      setActiveIndex(-1);
    },
    [navigate, clearSearch],
  );

  const handleSelect = useCallback(
    (idx: number) => {
      goToResult(results[idx]);
    },
    [results, goToResult],
  );

  const { clampedIndex, setActiveIndex, handleKeyDown } = useListKeyboard(results.length, handleSelect, () => {
    setIsOpen(false);
    inputRef.current?.focus();
  });

  useClickOutside(containerRef, () => setIsOpen(false));

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen || clampedIndex < 0) return;
    listRef.current
      ?.querySelector(`#${CSS.escape(`${listboxId}-option-${clampedIndex}`)}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [clampedIndex, isOpen, listboxId]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      if (inputValue.length >= 2) setIsOpen(true);
      return;
    }
    if (!isOpen) return;
    handleKeyDown(e);
  }

  let dropdownBody: React.ReactNode;
  if (isPending && results.length === 0) {
    dropdownBody = (
      <div className="flex items-center justify-center gap-2 p-4 text-sm text-text-secondary">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {t("searching")}
      </div>
    );
  } else if (isError && results.length === 0) {
    dropdownBody = (
      <div className="p-4 text-sm text-text-secondary" role="alert">
        {t("searchFailed")}
      </div>
    );
  } else if (results.length === 0) {
    dropdownBody = (
      <div className="p-4 text-sm text-text-secondary" role="status">
        {t("noResults")}
      </div>
    );
  } else {
    dropdownBody = results.map((result, index) => (
      <button
        key={`${result.source}-${result.id}-${index}`}
        id={`${listboxId}-option-${index}`}
        type="button"
        role="option"
        aria-selected={clampedIndex === index}
        className={cn(
          "w-full text-left p-2.5 rounded-none transition-colors active:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
          clampedIndex === index ? "bg-hover" : "hover:bg-hover",
        )}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => goToResult(result)}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-text-primary truncate">{result.name}</span>
          {typeof result.score === "number" && Number.isFinite(result.score) && (
            <span className="text-xs text-text-secondary ml-2 shrink-0 font-mono">{result.score.toFixed(1)}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-text-secondary">{t(result.source)}</span>
          {result.provider && <span className="text-xs text-text-tertiary">{result.provider}</span>}
        </div>
      </button>
    ));
  }

  return (
    <div ref={containerRef} className="relative w-full sm:w-72 min-w-0 max-w-full">
      <label htmlFor={inputId} className="sr-only">
        {t("searchPlaceholder")}
      </label>
      <div className="flex h-10 items-center gap-2 min-w-0 max-w-full border border-border rounded-none bg-bg-card px-3.5 focus-within:border-text-tertiary">
        <Search size={16} className="text-text-secondary shrink-0" aria-hidden="true" />
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
          className="min-w-0 flex-1 w-full text-base sm:text-sm bg-transparent outline-none text-text-primary placeholder:text-text-tertiary"
        />
        <button
          type="button"
          aria-label={t("clear")}
          aria-hidden={inputValue ? undefined : true}
          tabIndex={inputValue ? 0 : -1}
          onClick={() => {
            clearSearch();
            setIsOpen(false);
            setActiveIndex(-1);
            inputRef.current?.focus();
          }}
          className={cn(
            "shrink-0 rounded-none p-1 hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
            !inputValue && "invisible pointer-events-none",
          )}
        >
          <X size={14} className="text-text-secondary" />
        </button>
      </div>

      {isOpen && inputValue.length >= 2 && (
        <div
          id={listboxId}
          ref={listRef}
          role="listbox"
          className="absolute top-full left-0 right-0 sm:left-auto sm:right-0 sm:w-72 sm:max-w-[calc(100vw-2rem)] mt-1.5 max-h-[28rem] overflow-y-auto overscroll-contain no-scrollbar bg-bg-card border border-border rounded-none shadow-none z-50 animate-fade-in"
        >
          <div className="p-1.5">{dropdownBody}</div>
        </div>
      )}
      <div id={statusId} role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {isOpen && inputValue.length >= 2 && !isPending && t("searchResultsCount", { count: results.length })}
      </div>
    </div>
  );
}
