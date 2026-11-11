import { str } from "@/server/formats/scalars";
import { setField, type AaRow } from "../wire";
import { omniscienceBreakdownOf, overlayBreakdown } from "../wire-read";

/**
 * The slug a catalog row is keyed by, or `null` when the row cannot be a catalog entry: a row without the fields is the
 * legend or changelog snapshot the same prop bundles.
 */
function catalogSlug(row: AaRow): string | null {
  const slug = str(row.slug);
  if (!slug.trim() || !str(row.name).trim()) return null;
  return slug;
}

function mergeEntry(cur: AaRow, patch: AaRow): void {
  // Read the catalog's breakdown before the patch replaces it: spreading `cur` afterwards would merge the patch into a copy
  // of itself and lose the leaderboard's own accuracy/hallucination values.
  const prevBreakdown = omniscienceBreakdownOf(cur);
  const patchBreakdown = omniscienceBreakdownOf(patch);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === "") continue;
    setField(cur, key, value);
  }
  if (prevBreakdown && patch.omniscienceBreakdown) {
    const next = { ...prevBreakdown };
    overlayBreakdown(next, patchBreakdown ?? {});
    cur.omniscienceBreakdown = next;
  }
}

/** Overlays enrichment rows onto the leaderboard catalog, keyed by slug and skipping rows without an identity. Both sides are the same declared `AaRow` shape, so a field one side writes and the other reads is checked by the compiler. */
export function mergeBySlug(catalog: readonly AaRow[], ...enrich: readonly (readonly AaRow[])[]): AaRow[] {
  const bySlug = new Map<string, AaRow>();
  for (const raw of catalog) {
    const slug = catalogSlug(raw);
    if (slug === null) continue;
    if (!bySlug.has(slug)) bySlug.set(slug, raw);
  }
  // Two phases, so the copy is paid only where a patch lands: spreading every catalog row up front would copy rows that
  // no enrichment ever mutates.
  const patches = new Map<string, AaRow[]>();
  for (const group of enrich) {
    for (const raw of group) {
      const slug = str(raw.slug);
      if (!slug || !bySlug.has(slug)) continue;
      const bucket = patches.get(slug);
      if (bucket) bucket.push(raw);
      else patches.set(slug, [raw]);
    }
  }
  const merged: AaRow[] = [];
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
