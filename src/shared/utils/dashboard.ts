import type { HomeDashboardData } from "@/shared/types";

export function isPartialDashboard(d: HomeDashboardData): boolean {
  return d.orRankings == null || d.textToImage == null || d.opensource == null;
}
