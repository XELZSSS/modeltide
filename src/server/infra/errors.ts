import { isTimeoutLike } from "@/server/infra/http-error";

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

export class UpstreamError extends ApiError {
  readonly causedByTimeout: boolean;
  /** Origin HTTP status when the failure came from an upstream response. */
  readonly statusCode?: number;
  constructor(msg: string, opts?: { timeout?: boolean; status?: number }) {
    super(msg, opts?.timeout ? 504 : 502);
    this.name = "UpstreamError";
    this.causedByTimeout = opts?.timeout === true;
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
