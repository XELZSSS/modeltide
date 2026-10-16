export type ParseResult<T> =
  | { ok: true; data: T; warnings: string[] }
  | { ok: false; error: string; warnings: string[] };

export const parseOk = <T>(data: T, warnings: string[] = []): ParseResult<T> => ({ ok: true, data, warnings });

export const parseFail = (error: string, warnings: string[] = []): ParseResult<never> => ({
  ok: false,
  error,
  warnings,
});
