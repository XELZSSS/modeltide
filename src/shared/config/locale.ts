export type SupportedLocale = "zh-CN" | "en-US";

export function localeOf(lang: string): SupportedLocale {
  return lang === "zh" ? "zh-CN" : "en-US";
}

export const FALLBACK_DASH = "—";
export const FALLBACK_NA = "N/A";

// Single source for the app background lives in ./theme.ts (mirrored by CSS
// variables --bg-primary in src/styles/theme.css and the inline <style> in
// index.html; consistencyGuard verifies the three stay in sync).
export { THEME_COLORS } from "./theme";
