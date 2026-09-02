export const settled = <T>(r: PromiseSettledResult<T>, f: T): T => (r.status === "fulfilled" ? r.value : f);
export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
export const formatSettleErrors = (rs: readonly PromiseSettledResult<unknown>[], ls: readonly string[]): string =>
  rs
    .map((r, i) => (r.status === "rejected" ? `${ls[i] ?? i}: ${errMsg(r.reason)}` : null))
    .filter(Boolean)
    .join("; ");
