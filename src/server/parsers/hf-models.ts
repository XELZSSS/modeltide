import type { OpenSourceModelEntry } from "@/shared/types";
import { getOpenLicense } from "@/server/parsers/licenses";
import { isoDate, numIntNonNegative, strOrNull } from "@/server/parsers/primitives";
import { isValidRowId } from "@/server/parsers/data-filter";

export interface HFModel {
  id?: string;
  author?: string;
  downloads?: number;
  likes?: number;
  pipeline_tag?: string | null;
  createdAt?: string | null;
  lastModified?: string | null;
  tags?: string[];
}

export function resolveAuthor(m: HFModel, id: string): string | null {
  return strOrNull(m.author) ?? (id.split("/")[0]?.trim() || null);
}

/** License tags the allowlist doesn't recognize (observability helper, capped). */
export function findUnknownLicenseTags(items: HFModel[], cap = 5): string[] {
  const unknown = new Set<string>();
  for (const m of items) {
    if (!Array.isArray(m.tags)) continue;
    for (const t of m.tags) {
      if (typeof t !== "string" || !t.toLowerCase().startsWith("license:")) continue;
      if (getOpenLicense([t]) == null) unknown.add(t);
      if (unknown.size >= cap) break;
    }
    if (unknown.size >= cap) break;
  }
  return [...unknown];
}

export function mapModel(m: HFModel): OpenSourceModelEntry | null {
  if (!isValidRowId(m.id)) return null;
  const id = (m.id as string).trim();
  const downloads = numIntNonNegative(m.downloads) ?? 0;
  const likes = numIntNonNegative(m.likes) ?? 0;
  const tags = Array.isArray(m.tags) ? m.tags.filter((t): t is string => typeof t === "string") : [];
  const license = getOpenLicense(tags);
  return {
    id,
    author: resolveAuthor(m, id),
    downloads,
    likes,
    license,
    task: strOrNull(m.pipeline_tag),
    createdAt: isoDate(m.createdAt),
    lastModified: isoDate(m.lastModified),
    tags,
  };
}
