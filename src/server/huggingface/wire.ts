/**
 * Hugging Face's wire contract: one row of `huggingface.co/api/models`. Every member is optional and `unknown`, since the
 * Hub omits a field a repository has none of. `HF_LIST_FIELDS` asks for exactly these, and `satisfies readonly (keyof
 * HfModel)[]` makes a field this interface gains without being asked for a compile error.
 */

export interface HfModel {
  id?: unknown;
  author?: unknown;
  downloads?: unknown;
  likes?: unknown;
  pipeline_tag?: unknown;
  createdAt?: unknown;
  lastModified?: unknown;
  tags?: unknown;
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
