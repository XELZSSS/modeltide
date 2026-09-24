export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

export const parseOk = <T>(data: T): ParseResult<T> => ({ ok: true, data });

export const parseFail = (error: string): ParseResult<never> => ({ ok: false, error });
