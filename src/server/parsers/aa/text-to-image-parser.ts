import {
  isRecord,
  isValidTextToImageEntry,
  numCoerce,
  numCoerceNonNegative,
  strOrNull,
} from "@/server/parsers/parser-primitives";
import type { TextToImageModel } from "@/shared/types";
import type { RawEntry } from "@/server/parsers/upstream-types";
import { findLongestData, findNextData, parseRscPayload } from "@/server/parsers/rsc-parser";
import { parseFail, type ParseResult } from "@/server/parsers/parse-result";

export function parseTextToImageRows(body: unknown): ParseResult<Record<string, unknown>[]> {
  if (typeof body !== "string" || !body) return parseFail("Text-to-image returned an empty body");
  const scanned = parseRscPayload<Record<string, unknown>>(
    body,
    "textToImage",
    (tree) => findLongestData(tree, "textToImage") ?? findNextData(tree, "textToImage"),
  );
  return scanned.ok ? scanned : parseFail(`Text-to-image parse failed: ${scanned.error}`);
}

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
