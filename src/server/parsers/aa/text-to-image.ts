import { isValidTextToImageEntry, num, numNonNegative, strOrNull } from "@/server/parsers/primitives";
import type { TextToImageModel } from "@/shared/types";
import type { RawEntry } from "@/server/parsers/upstream";

export function mapEntry(raw: RawEntry): Omit<TextToImageModel, "rank"> | null {
  const id = strOrNull(raw.id);
  const slug = strOrNull(raw.slug);
  const name = strOrNull(raw.name);
  const elo = num(raw.elo);
  if (!isValidTextToImageEntry({ id, slug, name, elo })) return null;
  const creator = raw.creator as Record<string, unknown> | null | undefined;

  return {
    id: id as string,
    slug: slug as string,
    name: (name as string).trim(),
    elo: elo as number,
    eloLower: num(raw.lower95ci),
    eloUpper: num(raw.upper95ci),
    pricePer1kImages: numNonNegative(raw.price),
    creatorName: creator ? strOrNull(creator.name) : null,
  };
}
