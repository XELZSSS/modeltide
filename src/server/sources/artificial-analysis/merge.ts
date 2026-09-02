import { str, obj } from "@/server/parsers/primitives";

/**
 * Merge the base catalog with enrichment lists by slug; first occurrence wins for
 * the catalog, later enrichments overlay their fields onto existing entries.
 * Enrichment entries whose slug is absent from the catalog are skipped so they
 * never surface as ghost models. Deep-merges nested breakdown objects.
 */
export function mergeBySlug(
  catalog: Record<string, unknown>[],
  ...enrich: Record<string, unknown>[][]
): Record<string, unknown>[] {
  const merged = new Map<string, Record<string, unknown>>();
  for (const m of catalog) {
    const slug = str(m.slug);
    if (!slug || !str(m.name)) continue;
    if (!merged.has(slug)) merged.set(slug, { ...m });
  }
  for (const models of enrich) {
    for (const m of models) {
      const slug = str(m.slug);
      if (!slug || !merged.has(slug)) continue;
      const cur = merged.get(slug) as Record<string, unknown>;
      // Overlay only meaningful values: enrichment entries carry explicit nulls for
      // missing fields, which must not clobber values the catalog already has.
      const mergedEntry: Record<string, unknown> = { ...cur };
      for (const [key, value] of Object.entries(m)) {
        if (value !== null && value !== undefined) mergedEntry[key] = value;
      }
      if (cur.omniscienceBreakdown && m.omniscienceBreakdown) {
        mergedEntry.omniscienceBreakdown = { ...obj(cur.omniscienceBreakdown), ...obj(m.omniscienceBreakdown) };
      }
      merged.set(slug, mergedEntry);
    }
  }
  return [...merged.values()];
}
