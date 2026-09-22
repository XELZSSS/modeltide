import {
  isRecord,
  isValidTextToImageEntry,
  numCoerce,
  numCoerceNonNegative,
  strOrNull,
} from "@/server/parsers/parser-primitives";
import type { TextToImageModel } from "@/shared/types";
import type { RawEntry } from "@/server/parsers/upstream-types";

export function mapEntry(raw: unknown): Omit<TextToImageModel, "rank"> | null {
  if (!isRecord(raw)) return null;
  const entry = raw as RawEntry;
  const id = strOrNull(entry.id);
  const slug = strOrNull(entry.slug);
  const name = strOrNull(entry.name);
  const elo = numCoerce(entry.elo);
  if (!isValidTextToImageEntry({ id, slug, name, elo })) return null;

  return {
    id: id as string,
    slug: slug as string,
    name: (name as string).trim(),
    elo: elo as number,
    eloLower: numCoerce(entry.lower95ci),
    eloUpper: numCoerce(entry.upper95ci),
    pricePer1kImages: numCoerceNonNegative(entry.price),
    creatorName: isRecord(entry.creator) ? strOrNull(entry.creator.name) : null,
  };
}
