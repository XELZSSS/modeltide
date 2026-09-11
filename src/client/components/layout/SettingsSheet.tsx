"use client";
import { memo, type ReactNode } from "react";
import { Download, Languages, RefreshCw, SunMoon } from "lucide-react";
import { useTranslation } from "@/client/providers";
import { useSettingsStore } from "@/client/stores";
import { usePwaInstall, useSwUpdate } from "@/client/pwa/use-pwa";
import { Button } from "@/client/components/ui/button";
import { SegmentedGroup } from "@/client/components/ui/grids";
import { TabButton } from "@/client/components/ui/tabs";
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
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = options.findIndex((o) => o.value === value);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % options.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + options.length) % options.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    else return;
    e.preventDefault();
    const target = options[next];
    if (target) {
      onChange(target.value);
      document.getElementById(`setting-${label}-${target.value}`)?.focus();
    }
  };

  return (
    <SegmentedGroup role="radiogroup" aria-label={label} onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
      {options.map((opt) => (
        <TabButton
          key={opt.value}
          role="radio"
          size="sm"
          active={value === opt.value}
          onClick={() => onChange(opt.value)}
          id={`setting-${label}-${opt.value}`}
        >
          {opt.label}
        </TabButton>
      ))}
    </SegmentedGroup>
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
