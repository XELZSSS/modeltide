"use client";
import { Loader2 } from "lucide-react";
import { cn } from "@/client/utils/cn";
import { useTranslation } from "@/client/providers";
import type { SearchResult } from "@/shared/types";

interface Props {
  listboxId: string;
  results: SearchResult[];
  isPending: boolean;
  isError: boolean;
  activeIndex: number;
  onHover: (i: number) => void;
  onSelect: (r: SearchResult) => void;
}

export function SearchDropdown({ listboxId, results, isPending, isError, activeIndex, onHover, onSelect }: Props) {
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
        <button
          key={`${result.source}-${result.id}-${index}`}
          id={`${listboxId}-option-${index}`}
          type="button"
          role="option"
          aria-selected={activeIndex === index}
          className={cn(
            "w-full text-left p-2.5 rounded-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
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
        </button>
      ))}
    </>
  );
}
