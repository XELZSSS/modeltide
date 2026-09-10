import type { TextToImageModel } from "@/shared/types";
import { num, numNonNegative, strOrNull } from "@/server/parsers/primitives";
import { isValidTextToImageEntry } from "@/server/parsers/data-filter";

export interface RawEntry {
  id?: unknown;
  slug?: unknown;
  name?: unknown;
  elo?: unknown;
  lower95ci?: unknown;
  upper95ci?: unknown;
  price?: unknown;
  creator?: unknown;
}

/** Parsed entry; `rank` is assigned from elo order by the caller. */
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
