export function hexToRgba(hex: string, alpha: number): string {
  if (!hex.trim()) return `rgba(136, 136, 136, ${alpha})`;
  const value = hex.replace("#", "");
  if (!/^[0-9a-f]{3}$/i.test(value) && !/^[0-9a-f]{6}$/i.test(value)) {
    const pct = Math.round(alpha * 100);
    return `color-mix(in srgb, ${hex.trim()} ${pct}%, transparent)`;
  }
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  const int = Number.parseInt(full, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Provider dots need one thing from a brand colour: a recognisable hue that stays visible on both the white and the
 * #18181b canvas. Brand colours range from #000000 to pale pastels, so each one is re-rendered at a fixed perceptual
 * luminance (~0.2, about 4:1 against either surface) and duplicates are rotated to the next free hue.
 */
const PROVIDER_TARGET_LUMINANCE = 0.2;
const PROVIDER_SATURATION = 0.62;
const GOLDEN_ANGLE = 137.508;

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminanceOf([r, g, b]: readonly [number, number, number]): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function parseRgb(color: string): [number, number, number] | null {
  const value = color.trim().toLowerCase();
  if (value === "black") return [0, 0, 0];
  if (value === "white") return [255, 255, 255];
  const hex = value.startsWith("#") ? value.slice(1) : value;
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  if (!/^[0-9a-f]{6}$/.test(full)) return null;
  const int = Number.parseInt(full, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

/** Hue in degrees, or `null` for a grey (black/white/silver) that carries no hue to preserve. */
function hueOf([r, g, b]: readonly [number, number, number]): number | null {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return null;
  const sector = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  const degrees = sector * 60;
  return degrees < 0 ? degrees + 360 : degrees;
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const h = (((hue % 360) + 360) % 360) / 60;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs((h % 2) - 1));
  const [r, g, b] =
    h < 1
      ? [chroma, x, 0]
      : h < 2
        ? [x, chroma, 0]
        : h < 3
          ? [0, chroma, x]
          : h < 4
            ? [0, x, chroma]
            : h < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const m = lightness - chroma / 2;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** The mid-tone at `hue` whose relative luminance is closest to the target, so every dot reads on either surface. */
function midToneAt(hue: number): string {
  let low = 0.15;
  let high = 0.8;
  for (let i = 0; i < 12; i++) {
    const mid = (low + high) / 2;
    if (luminanceOf(hslToRgb(hue, PROVIDER_SATURATION, mid)) > PROVIDER_TARGET_LUMINANCE) high = mid;
    else low = mid;
  }
  return `hsl(${Math.round(hue)}, ${Math.round(PROVIDER_SATURATION * 100)}%, ${Math.round(low * 100)}%)`;
}

/** A stable hue for a provider whose brand colour is black, white or missing. */
function hueFromSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 360;
}

/**
 * One distinct, theme-independent colour per provider. `used` is per provider list, so two brands that share a colour
 * (or a hue) never end up with the same dot: the later one rotates to the next free hue.
 */
export function providerDotColor(brand: string | null | undefined, seed: string, used: Set<string>): string {
  const rgb = brand ? parseRgb(brand) : null;
  let hue = (rgb ? hueOf(rgb) : null) ?? hueFromSeed(seed);
  for (let i = 0; i < 36; i++) {
    const candidate = midToneAt(hue);
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
    hue = (hue + GOLDEN_ANGLE) % 360;
  }
  return midToneAt(hue);
}
