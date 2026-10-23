import { hasCatalogIdentity } from "@/server/formats/content-guards";
import { isRecord, obj, str } from "@/server/formats/scalars";

function mergeEntry(cur: Record<string, unknown>, patch: Record<string, unknown>): void {
  const assign = (target: Record<string, unknown>, source: Record<string, unknown>): void => {
    for (const [key, value] of Object.entries(source)) {
      if (value === null || value === undefined || value === "") continue;
      target[key] = value;
    }
  };
  assign(cur, patch);
  if (cur.omniscienceBreakdown && patch.omniscienceBreakdown) {
    const next: Record<string, unknown> = { ...obj(cur.omniscienceBreakdown) };
    assign(next, obj(patch.omniscienceBreakdown) ?? {});
    cur.omniscienceBreakdown = next;
  }
}

/** Overlays enrichment rows onto the leaderboard catalog, keyed by slug and skipping rows without an identity. */
export function mergeBySlug(catalog: unknown, ...enrich: unknown[]): Record<string, unknown>[] {
  const merged = new Map<string, Record<string, unknown>>();
  for (const raw of Array.isArray(catalog) ? catalog : []) {
    if (!hasCatalogIdentity(raw)) continue;
    const slug = str(raw.slug);
    if (!merged.has(slug)) merged.set(slug, { ...raw });
  }
  for (const group of enrich) {
    if (!Array.isArray(group)) continue;
    for (const raw of group) {
      if (!isRecord(raw)) continue;
      const slug = str(raw.slug);
      const current = slug ? merged.get(slug) : undefined;
      if (current !== undefined) mergeEntry(current, raw);
    }
  }
  return [...merged.values()];
}
