import { useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/client/components/ui";
import { useTranslation } from "@/client/providers";
import type { TranslationKey } from "@/shared/i18n";

/**
 * Back navigation that prefers the browser history (preserving ?tab=, scroll and
 * filter state) and falls back to pushing `to` when there is no in-app history
 * (deep link, new tab). Optional router state is forwarded on the fallback path.
 */
export function BackButton({ labelKey, to, state }: { labelKey: TranslationKey; to: string; state?: unknown }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const goBack = () => {
    // Prefer in-app history (preserves ?tab=/scroll/filter). The idx check alone
    // can't tell internal from external entries, so require a same-origin
    // referrer as well before going back; otherwise push `to`.
    const idx = typeof window !== "undefined" ? (window.history.state as { idx?: number } | null)?.idx : undefined;
    const ref = typeof document !== "undefined" ? document.referrer : "";
    let sameOriginRef = false;
    try {
      sameOriginRef = !!ref && new URL(ref).origin === window.location.origin;
    } catch {
      sameOriginRef = false;
    }
    if (typeof idx === "number" && idx > 0 && sameOriginRef) navigate(-1);
    else navigate(to, { state });
  };
  return (
    <Button size="sm" variant="outline" onClick={goBack} className="self-start">
      <ArrowLeft className="size-4" /> {t(labelKey)}
    </Button>
  );
}
