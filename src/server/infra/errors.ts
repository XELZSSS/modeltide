// Errors are classified by class and field, never by name; this is the only place that sniffs names.
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

// Re-throw the caller's abort when every leg was aborted: reporting a client abandon as an
// upstream failure would cool the whole key down for FAILURE_COOLDOWN_MS.
export function rethrowIfAllAborted(legs: readonly PromiseSettledResult<unknown>[]): void {
  if (legs.length === 0) return;
  if (!legs.every((leg) => leg.status === "rejected" && leg.reason instanceof ClientAbortError)) return;
  throw (legs[0] as PromiseRejectedResult).reason as Error;
}

export class UpstreamError extends ApiError {
  readonly causedByTimeout: boolean;
  readonly retryable: boolean;
  readonly statusCode?: number;
  constructor(msg: string, opts?: { timeout?: boolean; status?: number; retryable?: boolean }) {
    super(msg, opts?.timeout ? 504 : 502);
    this.name = "UpstreamError";
    this.causedByTimeout = opts?.timeout === true;
    this.retryable = opts?.retryable === true;
    if (opts?.status != null) this.statusCode = opts.status;
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
  const status = err instanceof UpstreamError ? err.statusCode : undefined;
  return new UpstreamError(`${prefix}: ${msg}`, {
    ...(isTimeoutLike(err) ? { timeout: true } : {}),
    ...(status != null ? { status } : {}),
  });
}
