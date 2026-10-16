// Single source for the app background lives in THEME_COLORS below (mirrored by
// CSS variables --bg-primary in src/styles/theme.css and the inline <style> in
// index.html; consistencyGuard verifies the three stay in sync).
export const THEME_COLORS = { light: "#fafbfc", dark: "#1a1a1a" } as const;

type SupportedLocale = "zh-CN" | "en-US";

export function localeOf(lang: string): SupportedLocale {
  return lang === "zh" ? "zh-CN" : "en-US";
}

export const FALLBACK_DASH = "—";
export const FALLBACK_NA = "N/A";

export const MODALITY_KEYS = ["text", "image", "speech", "video"] as const;

export type ModalityKey = (typeof MODALITY_KEYS)[number];
