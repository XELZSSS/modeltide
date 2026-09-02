import { useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/client/components/ui";
import { useTranslation } from "@/client/providers";
import type { TranslationKey } from "@/shared/i18n";

/**
 * Navigates to a target route, forwarding optional router state so the
 * destination page can restore context (e.g. a previously selected model).
 */
export function BackButton({ labelKey, to, state }: { labelKey: TranslationKey; to: string; state?: unknown }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <Button size="sm" variant="outline" onClick={() => navigate(to, { state })} className="self-start">
      <ArrowLeft className="size-4" /> {t(labelKey)}
    </Button>
  );
}
