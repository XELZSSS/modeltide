"use client";
import { memo } from "react";
import { cn } from "@/client/utils/cn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "@/client/providers";
import { Button } from "@/client/components/ui/button";

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  className?: string;
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button variant="outline" size="icon" aria-label={label} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}

export const Pagination = memo(function Pagination({ page, totalPages, onChange, className }: PaginationProps) {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;

  return (
    <nav aria-label={t("pagination")} className={cn("flex items-center justify-center gap-3 pt-2", className)}>
      <PageButton label={t("previousPage")} disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft size={16} />
      </PageButton>
      <span className="ui-caption tabular-nums min-w-16 text-center" aria-live="polite">
        {page} / {totalPages}
      </span>
      <PageButton label={t("nextPage")} disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        <ChevronRight size={16} />
      </PageButton>
    </nav>
  );
});
