import { describe, expect, it } from "vitest";
import {
  ClientAbortError,
  UpstreamError,
  isCallerAbort,
  isTimeoutLike,
  isTimeoutReason,
  rethrowIfAllAborted,
} from "./errors";

describe("isTimeoutReason", () => {
  it("recognizes the reason AbortSignal.timeout produces", () => {
    expect(isTimeoutReason(new DOMException("Timed out", "TimeoutError"))).toBe(true);
  });

  it("rejects a caller abort and non-error values", () => {
    expect(isTimeoutReason(new DOMException("gone", "AbortError"))).toBe(false);
    expect(isTimeoutReason(undefined)).toBe(false);
    expect(isTimeoutReason("TimeoutError")).toBe(false);
  });
});

describe("isCallerAbort", () => {
  it("is false for an intact or missing signal", () => {
    expect(isCallerAbort(new AbortController().signal)).toBe(false);
    expect(isCallerAbort(undefined)).toBe(false);
  });

  it("is true when the caller hung up", () => {
    const controller = new AbortController();
    controller.abort(new DOMException("gone", "AbortError"));
    expect(isCallerAbort(controller.signal)).toBe(true);
  });

  it("is false when our own execution budget expired", () => {
    const controller = new AbortController();
    controller.abort(new DOMException("Timed out", "TimeoutError"));
    expect(isCallerAbort(controller.signal)).toBe(false);
  });
});

describe("isTimeoutLike", () => {
  it("flags upstream timeouts and timeout-shaped errors", () => {
    expect(isTimeoutLike(new UpstreamError("boom", { timeout: true }))).toBe(true);
    expect(isTimeoutLike(new DOMException("t", "TimeoutError"))).toBe(true);
  });

  it("does not treat a plain upstream failure or a client abort as a timeout", () => {
    expect(isTimeoutLike(new UpstreamError("boom"))).toBe(false);
    expect(isTimeoutLike(new ClientAbortError("gone"))).toBe(false);
  });
});

describe("rethrowIfAllAborted", () => {
  it("rethrows when every leg was aborted by the caller", () => {
    expect(() => rethrowIfAllAborted([{ status: "rejected", reason: new ClientAbortError("gone") }])).toThrow(
      ClientAbortError,
    );
  });

  it("stays quiet when only some legs were aborted", () => {
    expect(() =>
      rethrowIfAllAborted([
        { status: "rejected", reason: new ClientAbortError("gone") },
        { status: "fulfilled", value: 1 },
      ]),
    ).not.toThrow();
  });
});
