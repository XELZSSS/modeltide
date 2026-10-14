import { cn } from "@/client/utils/cn";

export const STAT_GRID_COLS = { 2: "grid-cols-2", 4: "grid-cols-2 md:grid-cols-4" } as const;

export const INFO_GRID_COLS = "grid-cols-1 md:grid-cols-2";

export function gridClasses(variant: "stat" | "info", columns: 2 | 4 = 4, extra?: string): string {
  const cols = variant === "stat" ? STAT_GRID_COLS[columns] : INFO_GRID_COLS;
  return cn("grid gap-3 sm:gap-4", cols, extra);
}
