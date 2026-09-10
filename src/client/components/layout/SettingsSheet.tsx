"use client";
import { memo, type KeyboardEvent, type ReactNode } from "react";
import { Download, Languages, RefreshCw, SunMoon } from "lucide-react";
import { useTranslation } from "@/client/providers";
import { useSettingsStore } from "@/client/stores";
import { usePwaInstall, useSwUpdate } from "@/client/pwa/use-pwa";
import { Button } from "@/client/components/ui/button";
import { Sheet, SheetBody, SheetHeader } from "@/client/components/ui/sheet";
import { cn } from "@/client/utils/cn";

const Segmented = memo(function Segmented({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: ReactNode }[];
  label?: string;
}) {
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const dir = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
    const idx = options.findIndex((o) => o.value === value);
    const next = options[(idx + dir + options.length) % options.length];
    if (next) {
      onChange(next.value);
      // Move DOM focus to the newly checked radio (WAI-APG roving pattern).
      const group = e.currentTarget;
      const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
      buttons[(idx + dir + options.length) % options.length]?.focus();
    }
  };

  return (
    <div
      className="flex rounded-none border border-border bg-bg-secondary p-0.5"
      role="radiogroup"
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      {options.map((opt) => (
        <button
          type="button"
          key={opt.value}
          role="radio"
          aria-checked={value === opt.value}
          tabIndex={value === opt.value ? 0 : -1}
          onClick={() => onChange(opt.value)}
          className={cn(
            "h-7 px-3 rounded-none inline-flex items-center justify-center text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
            value === opt.value
              ? "bg-bg-card text-text-primary ring-1 ring-inset ring-border"
              : "text-text-secondary hover:text-text-primary",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
});

const SettingRow = memo(function SettingRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-4 py-3")}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-text-secondary shrink-0">{icon}</span>
        <p className="text-sm">{label}</p>
      </div>
      {children}
    </div>
  );
});

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang, setLang } = useTranslation();
  const themeMode = useSettingsStore((s) => s.themeMode);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);
  const { canInstall, isInstalled, isIos, promptInstall } = usePwaInstall();
  const { updateAvailable, applyUpdate } = useSwUpdate();

  return (
    <Sheet open={open} onClose={onClose} ariaLabel={t("settings")}>
      <SheetBody>
        <SheetHeader title={t("settings")} onClose={onClose} />

        <div className="divide-y divide-border">
          <SettingRow icon={<Languages size={16} />} label={t("language")}>
            <Segmented
              label={t("language")}
              value={lang}
              onChange={(v) => {
                if (v === "zh" || v === "en") setLang(v);
              }}
              options={[
                { value: "zh", label: "中文" },
                { value: "en", label: "EN" },
              ]}
            />
          </SettingRow>
          <SettingRow icon={<SunMoon size={16} />} label={t("themeToggle")}>
            <Segmented
              label={t("themeToggle")}
              value={themeMode}
              onChange={(v) => {
                if (v === "light" || v === "dark") setThemeMode(v);
              }}
              options={[
                { value: "light", label: t("themeLight") },
                { value: "dark", label: t("themeDark") },
              ]}
            />
          </SettingRow>
          <SettingRow icon={<Download size={16} />} label={t("pwaInstall")}>
            {isInstalled ? (
              <span className="text-xs text-text-tertiary">{t("pwaInstalled")}</span>
            ) : canInstall ? (
              <Button variant="outline" size="sm" onClick={() => void promptInstall()}>
                {t("pwaInstallCta")}
              </Button>
            ) : (
              <span className="text-xs text-text-tertiary text-right leading-5 max-w-[60%]">
                {isIos ? t("pwaIosHint") : t("pwaUnavailable")}
              </span>
            )}
          </SettingRow>
          {updateAvailable && (
            <SettingRow icon={<RefreshCw size={16} />} label={t("pwaUpdateAvailable")}>
              <Button variant="primary" size="sm" onClick={applyUpdate}>
                {t("pwaUpdateNow")}
              </Button>
            </SettingRow>
          )}
        </div>
      </SheetBody>
    </Sheet>
  );
}
