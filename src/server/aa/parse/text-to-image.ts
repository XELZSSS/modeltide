import { isRecord, numCoerce, numCoerceNonNegative } from "@/server/formats/scalars";
import { mapRows } from "@/server/formats/parse-rows";
import { toStringOrNull } from "@/shared/utils";
import type { TextToImageModel } from "@/shared/types";
import type { RawEntry } from "@/server/formats/wire-types";
import { findLongestData, findNextData } from "@/server/formats/rsc-data";
import { parseRscPayload } from "@/server/formats/rsc-parser";
import { parseFail, parseOk, type ParseResult } from "@/server/formats/parse-result";

export function parseTextToImageRows(body: unknown): ParseResult<TextToImageModel[]> {
  if (typeof body !== "string" || !body) return parseFail("Text-to-image returned an empty body");
  const scanned = parseRscPayload<Record<string, unknown>>(
    body,
    "textToImage",
    (tree) => findLongestData(tree, "textToImage") ?? findNextData(tree, "textToImage"),
  );
  if (!scanned.ok) return parseFail(`Text-to-image parse failed: ${scanned.error}`);
  const { rows, dropped } = mapRows(scanned.data, mapEntry);
  return parseOk(rows, dropped > 0 ? [`Dropped ${dropped} text-to-image rows without a usable identity or elo`] : []);
}

export function mapEntry(raw: unknown): TextToImageModel | null {
  if (!isRecord(raw)) return null;
  const entry = raw as RawEntry;
  const id = toStringOrNull(entry.id);
  const slug = toStringOrNull(entry.slug);
  const name = toStringOrNull(entry.name);
  const elo = numCoerce(entry.elo);
  if (id == null || slug == null || name == null || elo == null || !Number.isFinite(elo)) return null;

  return {
    id,
    slug,
    name: name.trim(),
    elo,
    eloLower: numCoerce(entry.lower95ci),
    eloUpper: numCoerce(entry.upper95ci),
    pricePer1kImages: numCoerceNonNegative(entry.price),
    creatorName: isRecord(entry.creator) ? toStringOrNull(entry.creator.name) : null,
  };
}
