import { isRecord, isValidTextToImageEntry, numCoerce, numCoerceNonNegative } from "@/server/parsers/parser-primitives";
import { toStringOrNull } from "@/shared/utils";
import type { TextToImageModel } from "@/shared/types";
import type { RawEntry } from "@/server/parsers/upstream-types";
import { findLongestData, findNextData, parseRscPayload } from "@/server/parsers/rsc-parser";
import { parseFail, parseOk, type ParseResult } from "@/server/parsers/parse-result";

export function parseTextToImageRows(body: unknown): ParseResult<Omit<TextToImageModel, "rank">[]> {
  if (typeof body !== "string" || !body) return parseFail("Text-to-image returned an empty body");
  const scanned = parseRscPayload<Record<string, unknown>>(
    body,
    "textToImage",
    (tree) => findLongestData(tree, "textToImage") ?? findNextData(tree, "textToImage"),
  );
  if (!scanned.ok) return parseFail(`Text-to-image parse failed: ${scanned.error}`);
  // Map once: the old flow ran mapEntry a second time in the source just to count drops.
  let dropped = 0;
  const rows: Omit<TextToImageModel, "rank">[] = [];
  for (const entry of scanned.data.map(mapEntry)) {
    if (entry === null) {
      dropped += 1;
      continue;
    }
    rows.push(entry);
  }
  return parseOk(rows, dropped > 0 ? [`Dropped ${dropped} text-to-image rows without a usable identity or elo`] : []);
}

export function mapEntry(raw: unknown): Omit<TextToImageModel, "rank"> | null {
  if (!isRecord(raw)) return null;
  const entry = raw as RawEntry;
  const id = toStringOrNull(entry.id);
  const slug = toStringOrNull(entry.slug);
  const name = toStringOrNull(entry.name);
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
    creatorName: isRecord(entry.creator) ? toStringOrNull(entry.creator.name) : null,
  };
}
