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

/**
 * Canonical message for "upstream parsed but kept nothing" failures:
 * `${label} yielded 0 ${unit} (${detail})`. `detail` is verbatim so callers
 * keep their source-specific counts (raw/kept/body/...).
 *
 * Parsers (which must not throw) use this pure formatter and hand the message
 * to the source layer, which raises it via `zeroUpstream` or `requireParsed`.
 */
export function zeroUpstreamMessage(label: string, unit: string, detail?: string): string {
  return `${label} yielded 0 ${unit}${detail ? ` (${detail})` : ""}`;
}

/** `zeroUpstreamMessage` wrapped as the canonical 502 error. */
export function zeroUpstream(label: string, unit: string, detail?: string): UpstreamError {
  return new UpstreamError(zeroUpstreamMessage(label, unit, detail));
}
