import { memo } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "@/client/providers";

/** Centered loading spinner. */
export const Spinner = memo(function Spinner() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
      <Loader2 className="size-6 animate-spin text-text-secondary" aria-hidden="true" />
      <span className="sr-only">{t("loading")}</span>
    </div>
  );
});
