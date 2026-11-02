import { isRecord, numCoerce, numCoerceNonNegative, textOrNull } from "@/server/formats/scalars";
import { findLongestData } from "@/server/formats/rsc-data";
import { parseRscRows } from "@/server/formats/rsc-rows";
import type { ParseResult } from "@/server/formats/parse-result";
import type { TextToImageModel } from "@/shared/types";
import type { AaImageRow } from "../wire";

/**
 * `AaImageRow`'s fields are all `unknown`, so reading one out of the wire record needs no check of its own: every field
 * is narrowed by `textOrNull` / `numCoerce` on the way in.
 */
export function parseTextToImageRows(body: unknown): ParseResult<TextToImageModel[]> {
  return parseRscRows<TextToImageModel>(body, {
    label: "Text-to-image",
    marker: "textToImage",
    find: findLongestData,
    map: (row) => mapEntry(row),
    dropped: (count) => `Dropped ${count} text-to-image rows without a usable identity or elo`,
  });
}

/** `mapRows` already rejected every non-object, so this receives the record it hands over — no re-check here. */
export function mapEntry(entry: AaImageRow): TextToImageModel | null {
  const id = textOrNull(entry.id);
  const slug = textOrNull(entry.slug);
  const name = textOrNull(entry.name);
  const elo = numCoerce(entry.elo);
  if (id == null || slug == null || name == null || elo == null) return null;

  return {
    id,
    slug,
    name,
    elo,
    eloLower: numCoerce(entry.lower95ci),
    eloUpper: numCoerce(entry.upper95ci),
    pricePer1kImages: numCoerceNonNegative(entry.price),
    creatorName: isRecord(entry.creator) ? textOrNull(entry.creator.name) : null,
  };
}
