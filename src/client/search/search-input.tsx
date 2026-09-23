import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/client/utils/cn";
import { useRouter } from "@/client/router";
import { useTranslation } from "@/client/providers";
import { useRouteSearchTerm } from "@/client/stores";
import type { SearchResult } from "@/client/search/types";
import { useSearchAllRankings, MIN_QUERY } from "@/client/search/use-search";
import { Combobox, useCombobox } from "@/client/search/combobox";

export function SearchInput({ className }: { className?: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const { term: searchTerm, setTerm: setSearchTerm } = useRouteSearchTerm();

  // The corpus queries warm while the box is focused; an untouched, unfocused box stays silent.
  const { results, isPending, isError } = useSearchAllRankings(searchTerm, { suspended: !isOpen, warm: isFocused });

  const combobox = useCombobox({
    initialValue: searchTerm,
    minQuery: MIN_QUERY,
    itemCount: results.length,
    isOpen,
    setIsOpen,
    setIsFocused,
    onSelect: (index) => {
      const result = results[index];
      if (result) router.push(result.link);
    },
  });

  useEffect(() => {
    if (combobox.debounced !== searchTerm) setSearchTerm(combobox.debounced);
  }, [combobox.debounced, searchTerm, setSearchTerm]);

  // The query sees only the debounced term, so input ahead of it means "nothing has run yet".
  const pending = isPending || combobox.inputValue !== searchTerm;

  return (
    <Combobox
      controller={combobox}
      className={className}
      status={pending ? null : t("searchResultsCount", { count: results.length })}
    >
      <SearchDropdown
        listboxId={combobox.listboxId}
        results={results}
        isPending={pending}
        isError={isError}
        activeIndex={combobox.activeIndex}
        onHover={combobox.onHover}
        onSelect={combobox.onSelectIndex}
      />
    </Combobox>
  );
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
  onSelect: (index: number) => void;
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
          // Keep focus on the input: a mousedown default moves focus to the body, whose focusin
          // closes the list and unmounts this row before its click is delivered.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(index)}
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
