export function isTimeoutLike(err: unknown): boolean {
  if (err instanceof UpstreamError) return err.causedByTimeout;
  if (err instanceof Error) return err.name === "TimeoutError" || err.name === "AbortError";
  return false;
}

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

export class ClientAbortError extends ApiError {
  constructor(msg: string) {
    super(msg, 499);
    this.name = "ClientAbortError";
  }
}

export function rethrowIfAllAborted(legs: readonly PromiseSettledResult<unknown>[]): void {
  if (legs.length === 0) return;
  if (!legs.every((leg) => leg.status === "rejected" && leg.reason instanceof ClientAbortError)) return;
  throw (legs[0] as PromiseRejectedResult).reason as Error;
}

export class UpstreamError extends ApiError {
  readonly causedByTimeout: boolean;
  readonly retryable: boolean;
  readonly watchdog: boolean;
  readonly retryAfterMs?: number;
  readonly statusCode?: number;
  constructor(
    msg: string,
    opts?: { timeout?: boolean; status?: number; retryable?: boolean; watchdog?: boolean; retryAfterMs?: number },
  ) {
    super(msg, opts?.timeout ? 504 : 502);
    this.name = "UpstreamError";
    this.causedByTimeout = opts?.timeout === true;
    this.retryable = opts?.retryable === true;
    this.watchdog = opts?.watchdog === true;
    if (opts?.status != null) this.statusCode = opts.status;
    if (opts?.retryAfterMs != null) this.retryAfterMs = opts.retryAfterMs;
  }
}

export function zeroUpstreamMessage(label: string, unit: string, detail?: string): string {
  return `${label} yielded 0 ${unit}${detail ? ` (${detail})` : ""}`;
}

export function zeroUpstream(label: string, unit: string, detail?: string): UpstreamError {
  return new UpstreamError(zeroUpstreamMessage(label, unit, detail));
}

export function wrapUpstream(prefix: string, err: unknown): UpstreamError {
  const msg = err instanceof Error ? err.message : String(err);
  const cause = err instanceof UpstreamError ? err : undefined;
  return new UpstreamError(`${prefix}: ${msg}`, {
    ...(isTimeoutLike(err) ? { timeout: true } : {}),
    ...(cause?.statusCode != null ? { status: cause.statusCode } : {}),
    ...(cause?.retryable ? { retryable: true } : {}),
    ...(cause?.retryAfterMs != null ? { retryAfterMs: cause.retryAfterMs } : {}),
    ...(cause?.watchdog ? { watchdog: true } : {}),
  });
}
