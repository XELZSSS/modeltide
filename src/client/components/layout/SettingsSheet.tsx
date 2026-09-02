import { memo, type ReactNode } from "react";
import { Languages, SunMoon, X, ExternalLink } from "lucide-react";
import { useTranslation } from "@/client/providers";
import { useSettingsStore } from "@/client/stores";
import { Button, Sheet } from "@/client/components/ui";
import { REPO_URL } from "@/shared/config";
import { cn } from "@/client/utils";

/** iOS-style segmented control used for the compact setting toggles. */
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
  return (
    // Clicks on a specific option must not bubble to the row's cycle-on-click handler.
    <div
      className="flex rounded-lg bg-bg-secondary p-0.5"
      role="radiogroup"
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
    >
      {options.map((opt) => (
        <button
          type="button"
          key={opt.value}
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "h-7 px-3 rounded-md inline-flex items-center justify-center text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
            value === opt.value
              ? "bg-bg-card text-text-primary shadow-sm"
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
  onActivate,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  /** Cycles the row's value when the row body is clicked (the segmented control stops propagation). */
  onActivate?: () => void;
}) {
  return (
    <div
      className={cn("flex items-center justify-between gap-4 px-3 py-2.5", onActivate && "cursor-pointer")}
      onClick={onActivate}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-text-secondary shrink-0">{icon}</span>
        <p className="text-sm">{label}</p>
      </div>
      {children}
    </div>
  );
});

/** Settings dialog: language/theme segmented controls, GitHub link and upstream source status. */
export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang, toggleLang } = useTranslation();
  const themeMode = useSettingsStore((s) => s.themeMode);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);

  return (
    <Sheet open={open} onClose={onClose} ariaLabel={t("settings")}>
      <div className="p-4 sm:p-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <p className="text-sm sm:text-base font-semibold">{t("settings")}</p>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("close")}>
            <X className="size-4" />
          </Button>
        </div>

        {/* Inset grouped rows: dividers only, no nested bordered boxes. Tapping anywhere
            on a preference row cycles its value; the segmented control is the precise path. */}
        <div className="divide-y divide-border">
          <SettingRow icon={<Languages size={16} />} label={t("language")} onActivate={toggleLang}>
            <Segmented
              label={t("language")}
              value={lang}
              onChange={(v) => v !== lang && toggleLang()}
              options={[
                { value: "zh", label: "中文" },
                { value: "en", label: "EN" },
              ]}
            />
          </SettingRow>
          <SettingRow icon={<SunMoon size={16} />} label={t("themeToggle")} onActivate={toggleTheme}>
            <Segmented
              label={t("themeToggle")}
              value={themeMode}
              onChange={(v) => v !== themeMode && toggleTheme()}
              options={[
                { value: "light", label: t("themeLight") },
                { value: "dark", label: t("themeDark") },
              ]}
            />
          </SettingRow>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-4 px-3 py-2.5 hover:bg-hover transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-text-secondary">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              <p className="text-sm">GitHub</p>
            </div>
            <ExternalLink size={14} className="text-text-secondary" />
          </a>
        </div>
      </div>
    </Sheet>
  );
}
