import { useMemo, useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import {
  useAllOpenSourceModels,
  useArtificialRankings,
  useHallucinationRankings,
  useOpenRouterRankings,
} from "@/client/api/queries";
import { modelDetailPath, cn } from "@/client/utils";
import type { SearchResult, SearchResultSource } from "@/shared/types";
import { SEARCH_SOURCE_TO_MODEL_SOURCE } from "@/shared/config";
import { matchTerm } from "@/shared/utils";
import { useNavigate } from "react-router";
import { Loader2, Search, X } from "lucide-react";
import { useTranslation } from "@/client/providers";
import { useSearchStore } from "@/client/stores";

// ---- useSearchAllRankings ----
interface SourceConfig<T> {
  items: T[];
  getFields: (item: T) => (string | undefined | null)[];
  map: (item: T) => SearchResult;
}

function collect<T>(config: SourceConfig<T>, term: string, out: { result: SearchResult; match: number }[]): void {
  for (const item of config.items) {
    const fields = config.getFields(item).map((v) => (v ? v.toLowerCase().trim() : ""));
    const { matched, score } = matchTerm(fields, term);
    if (!matched) continue;
    out.push({ result: config.map(item), match: score });
  }
}

function detailLink(source: SearchResultSource, id: string): string {
  return modelDetailPath(SEARCH_SOURCE_TO_MODEL_SOURCE[source], id);
}

interface SearchState {
  results: SearchResult[];
  isPending: boolean;
  isError: boolean;
  error: Error | null;
}

const MAX_RESULTS = 20;

// Stable empty refs: `?? []` inline would create a new array every render
// and defeat the useMemo deps below during pending states.
const EMPTY_ARRAY: never[] = [];

export function useSearchAllRankings(searchTerm: string): SearchState {
  const enabled = searchTerm.trim().length >= 2;
  const artificialQ = useArtificialRankings(enabled);
  const openSourceQ = useAllOpenSourceModels(enabled);
  const orQ = useOpenRouterRankings(enabled);

  const artificialData = artificialQ.data ?? EMPTY_ARRAY;
  const openSourceRankings = openSourceQ.data;
  const openRouterData = orQ.data?.tokenUsageRankings ?? EMPTY_ARRAY;
  const hallucinationRankings = useHallucinationRankings(artificialData, enabled);

  const error = [artificialQ.error, openSourceQ.error, orQ.error].find((e): e is Error | null => e != null) ?? null;

  const results = useMemo(() => {
    if (!enabled) return [];
    const term = searchTerm.toLowerCase().trim();
    if (!term) return [];
    const collected: { result: SearchResult; match: number }[] = [];
    collect(
      {
        items: artificialData,
        getFields: (m) => [m.name, m.slug, m.short_name, m.model_creators?.name],
        map: (m) => ({
          id: m.id,
          name: m.name,
          source: "modelRankings",
          score: m.intelligence_index,
          provider: m.model_creators?.name || null,
          link: detailLink("modelRankings", m.slug || m.id),
        }),
      },
      term,
      collected,
    );
    collect(
      {
        items: openRouterData,
        getFields: (m) => [m.name, m.id, m.creator],
        map: (m) => ({
          id: m.id,
          name: m.name,
          source: "openRouterRankings",
          score: null,
          provider: m.creator || null,
          link: detailLink("openRouterRankings", m.id),
        }),
      },
      term,
      collected,
    );
    collect(
      {
        items: openSourceRankings ?? [],
        getFields: (m) => [m.id, m.author ?? ""],
        map: (m) => ({
          id: m.id,
          name: m.id,
          source: "openSourceRankings",
          score: null,
          provider: m.author || null,
          link: detailLink("openSourceRankings", m.id),
        }),
      },
      term,
      collected,
    );
    collect(
      {
        items: hallucinationRankings,
        getFields: (m) => [m.model, m.slug, m.id],
        map: (m) => ({
          id: m.id,
          name: m.model,
          source: "hallucinationRankings",
          score: m.omniscienceIndex,
          provider: null,
          link: detailLink("hallucinationRankings", m.slug || m.id),
        }),
      },
      term,
      collected,
    );
    collected.sort((a, b) => b.match - a.match || (b.result.score ?? -Infinity) - (a.result.score ?? -Infinity));
    return collected.map((c) => c.result).slice(0, MAX_RESULTS);
  }, [enabled, searchTerm, artificialData, openRouterData, openSourceRankings, hallucinationRankings]);

  return {
    results,
    isPending: enabled && (artificialQ.isPending || openSourceQ.isPending || orQ.isPending),
    isError: enabled && (artificialQ.isError || openSourceQ.isError || orQ.isError),
    error,
  };
}

// ---- SearchInput ----
/** Debounce for the local field -> global store sync. */
const DEBOUNCE_MS = 200;
function useClickOutside(ref: RefObject<HTMLElement | null>, onOutside: () => void) {
  const onOutsideRef = useRef(onOutside);
  onOutsideRef.current = onOutside;

  useEffect(() => {
    function handle(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutsideRef.current();
    }
    document.addEventListener("pointerdown", handle);
    return () => document.removeEventListener("pointerdown", handle);
  }, [ref]);
}

function useListKeyboard(itemCount: number, onSelect: (index: number) => void, onClose?: () => void) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => setActiveIndex(-1), [itemCount]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
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
        // Select synchronously from the rendered index: never navigate
        // inside a setState updater (StrictMode double-invokes updaters).
        const clamped = activeIndex < 0 ? -1 : Math.min(activeIndex, itemCount - 1);
        if (clamped >= 0) selectRef.current(clamped);
        setActiveIndex(-1);
      } else if (e.key === "Escape") {
        setActiveIndex(-1);
        closeRef.current?.();
      }
    },
    [itemCount, activeIndex],
  );

  const clampedIndex = activeIndex < 0 ? -1 : Math.min(activeIndex, itemCount - 1);

  return { clampedIndex, setActiveIndex, handleKeyDown };
}

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
  // Local field -> global store with 200ms debounce.
  const [inputValue, setInputValue] = useState(searchTerm);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Skip redundant syncs (e.g. just cleared) to avoid timer churn.
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
  // Unmount safety: never resurrect a stale term after navigation.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const { results, isPending, isError } = useSearchAllRankings(searchTerm);

  // Clear synchronously on select so the destination never filters by the stale term.
  const clearSearch = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
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
      <div className="flex items-center gap-2 border border-border rounded-lg bg-bg-card px-3.5 py-2.5 focus-within:border-text-tertiary">
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
          className="w-full text-sm bg-transparent outline-none text-text-primary placeholder:text-text-tertiary"
        />
        {inputValue && (
          <button
            type="button"
            aria-label={t("clear")}
            onClick={() => {
              clearSearch();
              setIsOpen(false);
              setActiveIndex(-1);
              inputRef.current?.focus();
            }}
            className="rounded-md p-1 hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <X size={14} className="text-text-secondary" />
          </button>
        )}
      </div>

      {isOpen && inputValue.length >= 2 && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute top-full left-0 right-0 mt-1.5 max-h-[28rem] overflow-y-auto overscroll-contain no-scrollbar bg-bg-card border border-border rounded-lg shadow-lg z-50 sm:w-72 animate-fade-in"
        >
          <div className="p-1.5">
            {isPending && results.length === 0 ? (
              <div className="flex items-center justify-center gap-2 p-4 text-sm text-text-secondary">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {t("searching")}
              </div>
            ) : isError && results.length === 0 ? (
              <div className="p-4 text-sm text-text-secondary" role="alert">
                {t("searchFailed")}
              </div>
            ) : results.length === 0 ? (
              <div className="p-4 text-sm text-text-secondary" role="status">
                {t("noResults")}
              </div>
            ) : (
              results.map((result, index) => (
                <button
                  key={`${result.source}-${result.id}-${index}`}
                  id={`${listboxId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={clampedIndex === index}
                  ref={(el) => {
                    if (clampedIndex === index && el) el.scrollIntoView({ block: "nearest" });
                  }}
                  className={cn(
                    "w-full text-left p-2.5 rounded-md transition-colors active:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
                    clampedIndex === index ? "bg-hover" : "hover:bg-hover",
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => handleResultClick(result)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-text-primary truncate">{result.name}</span>
                    {typeof result.score === "number" && Number.isFinite(result.score) && (
                      <span className="text-xs text-text-secondary ml-2 shrink-0 font-mono">
                        {result.score.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-text-secondary">{t(result.source)}</span>
                    {result.provider && <span className="text-xs text-text-tertiary">{result.provider}</span>}
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
