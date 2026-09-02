export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export class ValidationError extends ApiError {
  constructor(msg: string) {
    super(msg, 400);
    this.name = "ValidationError";
  }
}

export class UpstreamError extends ApiError {
  constructor(msg: string) {
    super(msg, 502);
    this.name = "UpstreamError";
  }
}

export class RateLimitError extends ApiError {
  readonly retryAfterSec?: number;
  constructor(msg: string = "Too many requests, please retry later", retryAfterSec?: number) {
    super(msg, 429);
    this.name = "RateLimitError";
    this.retryAfterSec = retryAfterSec;
  }
}

export const settled = <T>(r: PromiseSettledResult<T>, f: T): T => (r.status === "fulfilled" ? r.value : f);
export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
export const formatSettleErrors = (rs: readonly PromiseSettledResult<unknown>[], ls: readonly string[]): string =>
  rs
    .map((r, i) => (r.status === "rejected" ? `${ls[i] ?? i}: ${errMsg(r.reason)}` : null))
    .filter(Boolean)
    .join("; ");
