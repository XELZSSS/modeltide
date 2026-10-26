import type { TFunction, TranslationKey } from "@/shared/i18n";
import type { ApiDomain } from "@/shared/config/api";
import { ApiClientError, type ClientErrorKind } from "../transport/error";

/** The reader's copy per kind: what failed, then what it means for them. */
const KIND_TEXT: Record<ClientErrorKind, { title: TranslationKey; message: TranslationKey }> = {
  "client-abort": { title: "errorAbortedTitle", message: "errorAbortedMessage" },
  timeout: { title: "errorTimeoutTitle", message: "errorTimeoutMessage" },
  "rate-limited": { title: "errorRateLimitedTitle", message: "errorRateLimitedMessage" },
  "upstream-unavailable": { title: "errorUpstreamTitle", message: "errorUpstreamMessage" },
  validation: { title: "errorValidationTitle", message: "errorValidationMessage" },
  "not-found": { title: "errorNotFoundTitle", message: "errorNotFoundMessage" },
  "method-not-allowed": { title: "errorMethodTitle", message: "errorMethodMessage" },
  internal: { title: "errorInternalTitle", message: "errorInternalMessage" },
  malformed: { title: "errorMalformedTitle", message: "errorMalformedMessage" },
  network: { title: "errorNetworkTitle", message: "errorNetworkMessage" },
  offline: { title: "errorOfflineTitle", message: "errorOfflineMessage" },
  unknown: { title: "errorUnknownTitle", message: "errorUnknownMessage" },
};

/** The label the reader already sees on that data source, so a failure names the source the same way the page does. */
const SOURCE_LABEL: Record<ApiDomain, TranslationKey> = {
  artificialIndex: "artificialSource",
  decisionIndex: "decisionSource",
  openRouterRankings: "openRouterSource",
  openSourceModels: "openSourceDataSource",
  closedReleases: "releaseDataSources",
  news: "errorSourceNews",
  homeDashboard: "errorSourceHomeDashboard",
};

interface ErrorText {
  kind: ClientErrorKind;
  title: string;
  message: string;
  /** Localized technical lines: which source, which statuses, when a retry is allowed again. */
  details: string[];
}

/**
 * `TimeoutError` is the client's own fetch budget and `AbortError` a navigation; both are the browser's names, not ours.
 * A request that never reached the server arrives as an `ApiClientError` of kind `network` (the fetch call wraps it),
 * so a bare `TypeError` here is an ordinary bug in our own code and stays `unknown` rather than telling the reader their
 * connection failed.
 */
export function classifyError(err: unknown): ClientErrorKind {
  if (err instanceof ApiClientError) return err.kind;
  const name = (err as { name?: unknown } | null | undefined)?.name;
  if (name === "TimeoutError") return "timeout";
  if (name === "AbortError") return "client-abort";
  if (navigator.onLine === false) return "offline";
  return "unknown";
}

function errorDetails(err: unknown, t: TFunction): string[] {
  if (!(err instanceof ApiClientError)) return [];
  const details: string[] = [];
  if (err.source !== undefined) details.push(t(SOURCE_LABEL[err.source]));
  if (err.status !== undefined) details.push(t("errorDetailStatus", { status: err.status }));
  if (err.upstreamStatus !== undefined) details.push(t("errorDetailUpstream", { status: err.upstreamStatus }));
  if (err.retryAfterS !== undefined) details.push(t("errorDetailRetryAfter", { seconds: err.retryAfterS }));
  // The server's own line is the developer-facing half of the same failure, so it comes last, under the numbers.
  if (err.kind !== "client-abort") details.push(t("errorDetailServer", { message: err.message }));
  return details;
}

/** The reader-facing view of any failure: a distinct title and meaning per kind, plus its technical detail lines. */
export function errorText(err: unknown, t: TFunction): ErrorText {
  const kind = classifyError(err);
  const copy = KIND_TEXT[kind];
  return { kind, title: t(copy.title), message: t(copy.message), details: errorDetails(err, t) };
}
