"use client";

export function cleanStringList(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0))).slice(
    0,
    max,
  );
}

export function logRehydrate<S>(scope: string) {
  return (_state: S | undefined, error: unknown): void => {
    if (error) console.warn(`[${scope}] rehydrate failed`, error);
  };
}
