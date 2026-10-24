import { hasCatalogIdentity } from "@/server/formats/content-guards";
import { obj, str } from "@/server/formats/scalars";

function mergeEntry(cur: Record<string, unknown>, patch: Record<string, unknown>): void {
  const assign = (target: Record<string, unknown>, source: Record<string, unknown>): void => {
    for (const [key, value] of Object.entries(source)) {
      if (value === null || value === undefined || value === "") continue;
      target[key] = value;
    }
  };
  // Read the catalog's breakdown before `assign` replaces it: spreading `cur` afterwards spread the patch object and
  // then merged the patch into a copy of itself, so the leaderboard's own accuracy/hallucination values were lost
  // whenever the enrichment row carried the block with some of its fields absent.
  const prevBreakdown = obj(cur.omniscienceBreakdown);
  assign(cur, patch);
  if (prevBreakdown && patch.omniscienceBreakdown) {
    const next: Record<string, unknown> = { ...prevBreakdown };
    assign(next, obj(patch.omniscienceBreakdown) ?? {});
    cur.omniscienceBreakdown = next;
  }
}

/**
 * Overlays enrichment rows onto the leaderboard catalog, keyed by slug and skipping rows without an identity.
 *
 * The catalog is the raw wire array the leaderboard parser already validated into `Record<string, unknown>` rows, so
 * each entry is re-checked for identity only. The enrichment pages are projected per field by `projectFields`, which
 * can emit an empty object for a row whose fields were all absent — that is why an enrich row still has to carry a
 * slug to be applied.
 */
export function mergeBySlug(
  catalog: readonly Record<string, unknown>[],
  ...enrich: readonly (readonly Record<string, unknown>[])[]
): Record<string, unknown>[] {
  const bySlug = new Map<string, Record<string, unknown>>();
  for (const raw of catalog) {
    if (!hasCatalogIdentity(raw)) continue;
    const slug = str(raw.slug);
    if (!bySlug.has(slug)) bySlug.set(slug, raw);
  }
  // Two phases, so the copy is paid only where a patch lands. Spreading every catalog row up front cost 1.8 ms on the
  // 272-row leaderboard (31 keys each) while only the 27 enriched rows are ever mutated.
  const patches = new Map<string, Record<string, unknown>[]>();
  for (const group of enrich) {
    for (const raw of group) {
      const slug = str(raw.slug);
      if (!slug || !bySlug.has(slug)) continue;
      const bucket = patches.get(slug);
      if (bucket) bucket.push(raw);
      else patches.set(slug, [raw]);
    }
  }
  const merged: Record<string, unknown>[] = [];
  for (const [slug, row] of bySlug) {
    const applying = patches.get(slug);
    if (applying === undefined) {
      merged.push(row);
      continue;
    }
    const copy = { ...row };
    for (const patch of applying) mergeEntry(copy, patch);
    merged.push(copy);
  }
  return merged;
}
