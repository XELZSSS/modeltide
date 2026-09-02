/** Base class for errors that map to a specific HTTP status in the API error handler. */
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

/** A third-party data source failed (network, bad status, or unparseable payload) — surfaced as 502 instead of a generic 500. */
export class UpstreamError extends ApiError {
  constructor(msg: string) {
    super(msg, 502);
    this.name = "UpstreamError";
  }
}

/** The client exceeded a route's rate limit — surfaced as 429. */
export class RateLimitError extends ApiError {
  constructor(msg: string = "Too many requests, please retry later") {
    super(msg, 429);
    this.name = "RateLimitError";
  }
}
