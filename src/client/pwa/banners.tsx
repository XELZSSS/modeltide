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
          className="flex shrink-0 items-center justify-center gap-2 border-b border-warning/30 bg-warning-light px-4 py-1.5 ui-caption"
        >
          <WifiOff size={14} className="text-warning" aria-hidden="true" />
          <span>{t("offlineNotice")}</span>
        </div>
      )}
      {updateAvailable && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 md:bottom-6 right-4 z-toast flex items-center gap-2.5 border border-border bg-bg-card px-3 py-2 shadow-lg animate-slide-up"
        >
          <RefreshCw size={14} className="text-accent shrink-0" aria-hidden="true" />
          <span className="ui-caption text-text-primary">{t("pwaUpdateAvailable")}</span>
          <Button variant="primary" size="sm" onClick={applyUpdate}>
            {t("pwaUpdateNow")}
          </Button>
        </div>
      )}
    </>
  );
}
