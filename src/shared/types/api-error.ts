import type { ApiDomain } from "../config/api";

/**
 * Why a route refused to answer. Stable on the wire: the reader's text is chosen from it, so adding or renaming a kind
 * is a contract change rather than a copy edit.
 */
const API_ERROR_KINDS = [
  "client-abort",
  "timeout",
  "rate-limited",
  "upstream-unavailable",
  "validation",
  "not-found",
  "method-not-allowed",
  "internal",
] as const;

export type ApiErrorKind = (typeof API_ERROR_KINDS)[number];

/**
 * The body every failing `/api/*` response carries. `message` stays developer-facing (it is what the log and the
 * console show); the reader's own copy is chosen from `kind` on the client, which is why the kind — not the wording —
 * is the part that must not drift.
 */
export interface ApiErrorBody {
  error: {
    /** The HTTP status, repeated in the body so a captured response still says which failure it was. */
    code: number;
    kind: ApiErrorKind;
    message: string;
    /** The route whose source did not answer; absent for a request that never reached a route. */
    source?: ApiDomain;
    /** What the upstream itself answered, when it answered at all. */
    upstreamStatus?: number;
  };
}

const KIND_BY_STATUS = {
  400: "validation",
  404: "not-found",
  405: "method-not-allowed",
  408: "timeout",
  429: "rate-limited",
  499: "client-abort",
  502: "upstream-unavailable",
  503: "rate-limited",
  504: "timeout",
} as const satisfies Record<number, ApiErrorKind>;

/**
 * The kind a status implies when the body named none: a middlebox error page, a service-worker copy, an edge response
 * from before this contract. The status is the only thing those still get right.
 */
export function defaultApiErrorKind(status: number): ApiErrorKind {
  return (KIND_BY_STATUS as Record<number, ApiErrorKind>)[status] ?? "internal";
}
