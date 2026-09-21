import type { HomeDashboardData } from "@/shared/types";

/** True when any dashboard leg failed and was nulled out. */
export function isPartialDashboard(d: HomeDashboardData): boolean {
  return d.orRankings == null || d.textToImage == null || d.opensource == null;
}
