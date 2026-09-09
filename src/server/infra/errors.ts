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
