/** Parsers return data or a failure reason and never throw; the source layer maps that to 502/504. */
export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

export const parseOk = <T>(data: T): ParseResult<T> => ({ ok: true, data });

export const parseFail = (error: string): ParseResult<never> => ({ ok: false, error });
