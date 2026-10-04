export const MAX_RSC_BYTES = 5 * 1024 * 1024;
export const MAX_RSC_LINE_CHARS = 2 * 1024 * 1024;
export const MAX_SCAN_CHARS = 8_000_000;
export const STREAM_LINE_RE = /^[0-9a-fA-F]{1,8}:(.*)$/s;
export const MAX_NEEDLE_CANDIDATES = 256;
export const MAX_NEEDLE_WORK_CHARS = 64 * 1024 * 1024;

export type RscExtractor<T> = (data: unknown, marker: string) => T[] | null;
