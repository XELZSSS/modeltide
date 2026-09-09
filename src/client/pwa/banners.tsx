"use client";
import { RefreshCw, WifiOff } from "lucide-react";
import { useTranslation } from "@/client/providers";
import { Button } from "@/client/components/ui/button";
import { useOnlineStatus, useSwUpdate } from "./use-pwa";

export function PwaBanners() {
  const online = useOnlineStatus();
  const { updateAvailable, applyUpdate } = useSwUpdate();
  const { t } = useTranslation();

  return (
    <>
      {!online && (
        <div
          role="status"
          className="flex shrink-0 items-center justify-center gap-2 border-b border-border bg-bg-secondary px-4 py-1.5 text-xs text-text-secondary"
        >
          <WifiOff size={14} aria-hidden="true" />
          <span>{t("offlineNotice")}</span>
        </div>
      )}
      {updateAvailable && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 md:bottom-6 right-4 z-40 flex items-center gap-2 border border-border bg-bg-card px-3 py-2 shadow-lg"
        >
          <RefreshCw size={14} className="text-text-secondary shrink-0" aria-hidden="true" />
          <span className="text-xs text-text-primary">{t("pwaUpdateAvailable")}</span>
          <Button variant="primary" size="sm" onClick={applyUpdate}>
            {t("pwaUpdateNow")}
          </Button>
        </div>
      )}
    </>
  );
}
