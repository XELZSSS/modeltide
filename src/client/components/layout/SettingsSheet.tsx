import { memo, type ReactNode } from "react";
import { Languages, SunMoon, X } from "lucide-react";
import { useTranslation } from "@/client/providers";
import { useSettingsStore } from "@/client/stores";
import { Button, Sheet } from "@/client/components/ui";
import { cn } from "@/client/utils";

/** iOS-style segmented control for compact setting toggles. */
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
    // Clicks on an option must not bubble to the row's cycle-on-click handler.
    <div
      className="flex rounded-none border border-border bg-bg-secondary p-0.5"
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
  onActivate,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  /** Cycles the value when the row body is clicked. */
  onActivate?: () => void;
}) {
  return (
    <div
      role={onActivate ? "button" : undefined}
      tabIndex={onActivate ? 0 : undefined}
      aria-label={onActivate ? label : undefined}
      className={cn("flex items-center justify-between gap-3 px-4 py-3", onActivate && "cursor-pointer")}
      onClick={onActivate}
      onKeyDown={
        onActivate
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onActivate();
              }
            }
          : undefined
      }
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-text-secondary shrink-0">{icon}</span>
        <p className="text-sm">{label}</p>
      </div>
      {children}
    </div>
  );
});

/** Settings dialog: language/theme controls, GitHub link. */
export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang, setLang } = useTranslation();
  const themeMode = useSettingsStore((s) => s.themeMode);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);
  const toggleLang = useSettingsStore((s) => s.toggleLang);

  return (
    <Sheet open={open} onClose={onClose} ariaLabel={t("settings")}>
      <div className="p-5 flex flex-col gap-5 max-h-[70vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <p className="ui-card-title">{t("settings")}</p>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("close")}>
            <X className="size-4" />
          </Button>
        </div>

        {/* Inset grouped rows, no nested boxes. Tapping a row cycles its value. */}
        <div className="divide-y divide-border">
          <SettingRow icon={<Languages size={16} />} label={t("language")} onActivate={toggleLang}>
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
          <SettingRow icon={<SunMoon size={16} />} label={t("themeToggle")} onActivate={toggleTheme}>
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
        </div>
      </div>
    </Sheet>
  );
}
