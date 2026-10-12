export function hexToRgba(hex: string, alpha: number): string {
  if (!hex || !hex.trim()) return `rgba(136, 136, 136, ${alpha})`;
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
  if (!Number.isFinite(int)) return hex;
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
