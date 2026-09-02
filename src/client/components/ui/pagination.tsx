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

export const Pagination = memo(function Pagination({
  page,
  totalPages,
  onChange,
  className,
  label,
}: PaginationProps & { label?: string }) {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;

  return (
    <nav aria-label={label ?? t("pagination")} className={cn("flex items-center gap-3", className)}>
      <PageButton label={t("previousPage")} disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft size={16} />
      </PageButton>
      <span className="text-sm text-text-secondary tabular-nums" aria-live="polite">
        {page} / {totalPages}
      </span>
      <PageButton label={t("nextPage")} disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        <ChevronRight size={16} />
      </PageButton>
    </nav>
  );
});
