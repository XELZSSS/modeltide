const SANS_FAMILIES = [
  '"IBM Plex Sans"',
  "-apple-system",
  "BlinkMacSystemFont",
  '"Segoe UI"',
  '"Segoe UI Symbol"',
  '"PingFang SC"',
  '"Hiragino Sans GB"',
  '"Microsoft YaHei"',
  '"Noto Sans SC"',
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
  '"Segoe UI Symbol"',
  '"PingFang SC"',
  '"Hiragino Sans GB"',
  '"Microsoft YaHei"',
  '"Noto Sans SC"',
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
