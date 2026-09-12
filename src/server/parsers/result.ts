/**
 * Uniform domain-parser outcome. Parsers return data or a failure reason and
 * never throw — translating a failure into an HTTP status (502/504) is the
 * source layer's job (see `requireParsed` in `src/server/sources/pipeline.ts`).
 */
export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

export const parseOk = <T>(data: T): ParseResult<T> => ({ ok: true, data });

export const parseFail = (error: string): ParseResult<never> => ({ ok: false, error });
