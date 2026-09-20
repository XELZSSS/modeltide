"use client";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter } from "@/client/router";
import { Search, X } from "lucide-react";
import { cn } from "@/client/utils/cn";
import { Input } from "@/client/components/ui/input";
import { useTranslation } from "@/client/providers";
import { useSearchStore } from "@/client/stores";
import type { SearchResult } from "@/shared/types";
import { useSearchAllRankings } from "@/client/search/use-search";
import { useClickOutside, useListKeyboard } from "@/client/search/interaction";
import { useDebouncedTerm } from "@/client/search/use-debounced-term";
import { SearchDropdown } from "@/client/search/SearchDropdown";

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
  const pathname = usePathname();
  const { inputValue, setInputValue, debounced, setDebouncedDirect, cancel } = useDebouncedTerm("", 200);

  // Pathname only: ?tab= switches (replaceState) must preserve the typed query.
  useEffect(() => {
    cancel();
    setDebouncedDirect("");
  }, [pathname, cancel, setDebouncedDirect]);
  useEffect(() => {
    if (debounced !== searchTerm) setSearchTerm(debounced);
  }, [debounced, searchTerm, setSearchTerm]);

  const { results, isPending, isError } = useSearchAllRankings(searchTerm, { suspended: !isOpen });

  const clearSearch = () => {
    setDebouncedDirect("");
  };

  const goToResult = (result: SearchResult | undefined) => {
    if (!result) return;
    clearSearch();
    router.push(result.link);
    setIsOpen(false);
    setActiveIndex(-1);
  };

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
      <div className="flex h-9 items-center gap-2 min-w-0 max-w-full ui-card rounded-none px-3 transition-colors duration-fast focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-ring/30">
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
            if (inputValue.length >= MIN_QUERY) setIsOpen(true);
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
            "shrink-0 rounded-none p-1 hoverable:hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
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
