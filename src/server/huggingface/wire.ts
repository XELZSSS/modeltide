/**
 * Hugging Face's wire contract: one row of `huggingface.co/api/models`.
 *
 * Every member is optional because the Hub omits a field when a repository has none of it, and the mapper narrows each
 * one through `textOrNull` / `numIntCoerceNonNegative`. `HF_LIST_FIELDS` is the other half of the same declaration: the
 * request asks for exactly these, so a field this interface gains without being asked for is a `null` the parser would
 * have to explain, and `satisfies readonly (keyof HfModel)[]` makes that mismatch a compile error instead.
 */

export interface HfModel {
  id?: string;
  author?: string;
  downloads?: number;
  likes?: number;
  pipeline_tag?: string | null;
  createdAt?: string | null;
  lastModified?: string | null;
  tags?: string[];
}

/** The `expand[]` list the list request sends; `tags` is read by the detail payload only. */
export const HF_LIST_FIELDS = [
  "author",
  "downloads",
  "likes",
  "tags",
  "pipeline_tag",
  "createdAt",
  "lastModified",
] as const satisfies readonly (keyof HfModel)[];
