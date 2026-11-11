import { isRecord, obj } from "@/server/formats/scalars";
import { isValidOpenRouterDirectoryRow } from "@/server/formats/content-guards";
import type { OrAaBenchmarksBlock, OrDirectoryRow, OrPriceableRow, OrRankingRow } from "./wire";

/** The narrowing functions of OpenRouter's wire contract: the two gates that turn a raw record into the shapes `wire.ts` declares, plus the projection that reads the AA block back out of a directory row. */

/** A ranking row is usable only when it names the model it aggregates under: `groupRows` keys every row by this field. */
export function isOrRankingRow(value: unknown): value is OrRankingRow {
  return isRecord(value) && typeof value.model_permaslug === "string";
}

/** The directory's pricing gate: an id the API would accept and a pricing object to read; it establishes the half the price readers take as given. */
export function isOrDirectoryRow(value: unknown): value is OrDirectoryRow & OrPriceableRow {
  return isValidOpenRouterDirectoryRow(value);
}

/** The `benchmarks.artificial_analysis` block of one directory row, when the row carries one. */
export function aaBenchmarksOf(row: OrDirectoryRow): OrAaBenchmarksBlock | undefined {
  const benchmarks = obj(row.benchmarks);
  const block = obj(benchmarks?.artificial_analysis);
  return block as OrAaBenchmarksBlock | undefined;
}
