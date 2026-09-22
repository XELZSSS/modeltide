/**
 * Modality keys shared by the parser that emits the `input_modality_*` /
 * `output_modality_*` flags and the detail view that renders them, so the two
 * cannot drift apart silently.
 */
export const MODALITY_KEYS = ["text", "image", "speech", "video"] as const;

export type ModalityKey = (typeof MODALITY_KEYS)[number];
