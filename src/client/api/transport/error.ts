import type { ApiDomain } from "@/shared/config/api";
import type { ApiErrorKind } from "@/shared/types/api-error";

/**
 * Every failure the client can name: the API's own kinds plus the three only the browser knows about — `network` for a
 * request that never reached the server, `offline` for the device having no connection, and `malformed` for a response
 * that arrived but could not be read.
 */
export type ClientErrorKind = ApiErrorKind | "malformed" | "network" | "offline" | "unknown";

interface ClientErrorDetail {
  /** The response status; absent when the failure came from decoding a payload after a successful read. */
  status?: number;
  source?: ApiDomain;
  upstreamStatus?: number;
  retryAfterS?: number;
}

/**
 * A failed API read, named by `kind` so the reader is told what actually happened instead of one shared "something went
 * wrong". The status fields are the technical half and are kept apart from the message for that reason: they are shown
 * under the reader's text rather than inside it.
 */
export class ApiClientError extends Error {
  readonly kind: ClientErrorKind;
  readonly status?: number;
  readonly source?: ApiDomain;
  readonly upstreamStatus?: number;
  readonly retryAfterS?: number;

  constructor(message: string, kind: ClientErrorKind, detail: ClientErrorDetail = {}) {
    super(message);
    this.name = "ApiClientError";
    this.kind = kind;
    if (detail.status !== undefined) this.status = detail.status;
    if (detail.source !== undefined) this.source = detail.source;
    if (detail.upstreamStatus !== undefined) this.upstreamStatus = detail.upstreamStatus;
    if (detail.retryAfterS !== undefined) this.retryAfterS = detail.retryAfterS;
  }
}

/** A payload that arrived and could not be decoded into what the view reads. */
export function malformedPayload(message: string): ApiClientError {
  return new ApiClientError(message, "malformed");
}

export function isAbortError(err: unknown): boolean {
  const name = (err as { name?: unknown } | null | undefined)?.name;
  return name === "AbortError" || name === "TimeoutError";
}
