const SANS_FAMILIES = [
  '"IBM Plex Sans"',
  // The metric-matched stand-in for Plex (see the `Plex Fallback` @font-face in src/styles/globals.css). It sits second
  // so the pre-swap frame is laid out with Plex's own line metrics and advance widths instead of the platform default.
  '"Plex Fallback"',
  "-apple-system",
  "BlinkMacSystemFont",
  '"Segoe UI"',
  // CJK before the symbol face: `Segoe UI Symbol` also covers `…`, `−`, arrows and box drawing, and on Windows it would
  // otherwise win those characters inside Chinese text, whose metrics and baseline do not match the CJK family.
  '"PingFang SC"',
  '"Hiragino Sans GB"',
  '"Microsoft YaHei"',
  '"Noto Sans SC"',
  '"Segoe UI Symbol"',
  '"Apple Color Emoji"',
  '"Segoe UI Emoji"',
  '"Noto Color Emoji"',
  "sans-serif",
] as const;

const MONO_FAMILIES = [
  '"IBM Plex Mono"',
  "ui-monospace",
  '"SF Mono"',
  '"SFMono-Regular"',
  "Menlo",
  "Consolas",
  '"Liberation Mono"',
  // Same ordering rule as the sans stack: CJK first, the symbol face last.
  '"PingFang SC"',
  '"Hiragino Sans GB"',
  '"Microsoft YaHei"',
  '"Noto Sans SC"',
  '"Segoe UI Symbol"',
  "monospace",
] as const;

export const FONT_STACK_SANS = SANS_FAMILIES.join(", ");
export const FONT_STACK_MONO = MONO_FAMILIES.join(", ");

export function normalizeFontStack(stack: string): string {
  return stack
    .replace(/\s+/g, " ")
    .split(",")
    .map((family) => family.trim())
    .join(", ");
}
