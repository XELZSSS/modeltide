import { cn } from "@/client/utils/cn";

const STAT_GRID_COLS = { 2: "grid-cols-2", 4: "grid-cols-2 md:grid-cols-4" } as const;

const INFO_GRID_COLS = "grid-cols-1 md:grid-cols-2";

export function statGridClasses(columns: 2 | 4, extra?: string): string {
  return cn("grid gap-3 sm:gap-4", STAT_GRID_COLS[columns], extra);
}

export function infoGridClasses(extra?: string): string {
  return cn("grid gap-3 sm:gap-4", INFO_GRID_COLS, extra);
}
