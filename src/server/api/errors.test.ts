import { describe, expect, it } from "vitest";
import { ClientAbortError, UpstreamError, isTimeoutLike, rethrowIfAllAborted } from "./errors";

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
