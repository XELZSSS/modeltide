"use client";
import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import { useRouter } from "@/client/router";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/client/utils/cn";
import { Input } from "@/client/components/ui/input";
import { useTranslation } from "@/client/providers";
import { useSearchStore } from "@/client/stores";
import type { SearchResult } from "@/shared/types";
import { useSearchAllRankings } from "@/client/search/use-search";

const MIN_QUERY = 2;

export function SearchInput({ className }: { className?: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const listboxId = useId();
  const statusId = useId();

  const searchTerm = useSearchStore((s) => s.searchTerm);
  const setSearchTerm = useSearchStore((s) => s.setSearchTerm);
  const { inputValue, setInputValue, debounced, setDebouncedDirect } = useDebouncedTerm("", 200);

  useEffect(() => {
    if (debounced !== searchTerm) setSearchTerm(debounced);
  }, [debounced, searchTerm, setSearchTerm]);

  const { results, isPending, isError } = useSearchAllRankings(searchTerm, { suspended: !isOpen });

  const clearSearch = () => {
    setDebouncedDirect("");
  };

  function goToResult(result: SearchResult | undefined): void {
    if (!result) return;
    clearSearch();
    router.push(result.link);
    setIsOpen(false);
  }

  const { clampedIndex, setActiveIndex, handleKeyDown } = useListKeyboard(
    results.length,
    (idx) => goToResult(results[idx]),
    () => {
      setIsOpen(false);
      inputRef.current?.focus();
    },
  );

  useClickOutside(containerRef, () => setIsOpen(false));

  useEffect(() => {
    if (!isOpen || clampedIndex < 0) return;
    listRef.current
      ?.querySelector(`#${CSS.escape(`${listboxId}-option-${clampedIndex}`)}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [clampedIndex, isOpen, listboxId]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      if (inputValue.length >= MIN_QUERY) setIsOpen(true);
      return;
    }
    if (!isOpen) return;
    handleKeyDown(e);
  }

  return (
    <div ref={containerRef} className={cn("relative w-full sm:w-72 min-w-0 max-w-full", className)}>
      <label htmlFor={inputId} className="sr-only">
        {t("searchPlaceholder")}
      </label>
      <div className="flex h-9 items-center gap-2 min-w-0 max-w-full ui-card px-3 transition-colors duration-fast focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-ring/30">
        <Search size={16} className="text-text-secondary shrink-0" aria-hidden="true" />
        <Input
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
            setIsOpen(e.target.value.length >= MIN_QUERY);
            setActiveIndex(-1);
          }}
          onFocus={() => {
            if (inputValue.length >= MIN_QUERY) {
              setIsOpen(true);
              setActiveIndex(-1);
            }
          }}
          onKeyDown={onKeyDown}
          placeholder={t("searchPlaceholder")}
          className="flex-1 border-0 bg-transparent px-0 h-full focus:border-transparent focus:ring-0"
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
            "shrink-0 p-1 hoverable:hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
            !inputValue && "invisible pointer-events-none",
          )}
        >
          <X size={14} className="text-text-secondary" />
        </button>
      </div>

      {isOpen && inputValue.length >= MIN_QUERY && (
        <div
          id={listboxId}
          ref={listRef}
          role="listbox"
          className="absolute top-full left-0 right-0 sm:left-auto sm:right-0 sm:w-72 sm:max-w-[calc(100vw-2rem)] mt-1.5 max-h-[28rem] overflow-y-auto overscroll-contain no-scrollbar ui-overlay-md z-40 animate-fade-in"
        >
          <div className="p-1.5">
            <SearchDropdown
              listboxId={listboxId}
              results={results}
              isPending={isPending}
              isError={isError}
              activeIndex={clampedIndex}
              onHover={setActiveIndex}
              onSelect={goToResult}
            />
          </div>
        </div>
      )}
      <div id={statusId} role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {isOpen && inputValue.length >= MIN_QUERY && !isPending && t("searchResultsCount", { count: results.length })}
      </div>
    </div>
  );
}

function useDebouncedTerm(
  initial: string,
  delayMs = 200,
): {
  inputValue: string;
  setInputValue: (v: string) => void;
  debounced: string;
  setDebouncedDirect: (v: string) => void;
} {
  const [inputValue, setInputValue] = useState(initial);
  const [debounced, setDebounced] = useState(initial);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  useEffect(() => () => cancel(), [cancel]);
  useEffect(() => {
    if (inputValue === debounced) return;
    cancel();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setDebounced(inputValue);
    }, delayMs);
  }, [inputValue, debounced, delayMs, cancel]);
  const setDebouncedDirect = useCallback(
    (v: string) => {
      cancel();
      setDebounced(v);
      setInputValue(v);
    },
    [cancel],
  );
  return { inputValue, setInputValue, debounced, setDebouncedDirect };
}

function useClickOutside(ref: RefObject<HTMLElement | null>, onOutside: () => void) {
  const onOutsideRef = useRef(onOutside);
  useEffect(() => {
    onOutsideRef.current = onOutside;
  });

  useEffect(() => {
    function handle(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutsideRef.current();
    }
    function handleFocus(e: FocusEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutsideRef.current();
    }
    document.addEventListener("pointerdown", handle);
    document.addEventListener("focusin", handleFocus);
    return () => {
      document.removeEventListener("pointerdown", handle);
      document.removeEventListener("focusin", handleFocus);
    };
  }, [ref]);
}

function useListKeyboard(itemCount: number, onSelect: (index: number) => void, onClose?: () => void) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const [prevItemCount, setPrevItemCount] = useState(itemCount);
  if (prevItemCount !== itemCount) {
    setPrevItemCount(itemCount);
    setActiveIndex(-1);
  }

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveIndex(-1);
        onClose?.();
        return;
      }
      if (itemCount === 0) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") e.preventDefault();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % itemCount);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i <= 0 ? itemCount - 1 : i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const clamped = activeIndex < 0 ? -1 : Math.min(activeIndex, itemCount - 1);
        if (clamped >= 0) onSelect(clamped);
        setActiveIndex(-1);
      }
    },
    [itemCount, activeIndex, onSelect, onClose],
  );

  const clampedIndex = activeIndex < 0 ? -1 : Math.min(activeIndex, itemCount - 1);

  return { clampedIndex, setActiveIndex, handleKeyDown };
}

function SearchDropdown({
  listboxId,
  results,
  isPending,
  isError,
  activeIndex,
  onHover,
  onSelect,
}: {
  listboxId: string;
  results: SearchResult[];
  isPending: boolean;
  isError: boolean;
  activeIndex: number;
  onHover: (i: number) => void;
  onSelect: (r: SearchResult) => void;
}) {
  const { t } = useTranslation();
  if (isPending && results.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 p-4 text-sm text-text-secondary">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {t("searching")}
      </div>
    );
  }
  if (isError && results.length === 0) {
    return (
      <div className="p-4 text-sm text-text-secondary" role="alert">
        {t("searchFailed")}
      </div>
    );
  }
  if (results.length === 0) {
    return (
      <div className="p-4 text-sm text-text-secondary" role="status">
        {t("noResults")}
      </div>
    );
  }
  return (
    <>
      {results.map((result, index) => (
        // A <div>: the combobox input drives selection via aria-activedescendant.
        <div
          key={`${result.source}-${result.id}-${index}`}
          id={`${listboxId}-option-${index}`}
          role="option"
          aria-selected={activeIndex === index}
          className={cn(
            "w-full text-left p-2.5 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
            activeIndex === index ? "bg-hover" : "hoverable:hover:bg-hover",
          )}
          onMouseEnter={() => onHover(index)}
          onClick={() => onSelect(result)}
        >
          <span className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-text-primary truncate">{result.name}</span>
            {typeof result.score === "number" && Number.isFinite(result.score) && (
              <span className="text-xs text-text-secondary ml-2 shrink-0 font-mono">{result.score.toFixed(1)}</span>
            )}
          </span>
          <span className="flex items-center gap-2 mt-1">
            <span className="text-xs text-text-secondary">{t(result.source)}</span>
            {result.provider && <span className="text-xs text-text-tertiary">{result.provider}</span>}
          </span>
        </div>
      ))}
    </>
  );
}
