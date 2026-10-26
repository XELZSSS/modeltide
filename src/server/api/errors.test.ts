import { describe, expect, it } from "vitest";
import { ClientAbortError, UpstreamError, isTimeoutLike, rethrowIfAllAborted } from "./errors";

const ABORT_MESSAGE = "gone";

describe("isTimeoutLike", () => {
  it.each([
    ["an upstream timeout", new UpstreamError("boom", { timeout: true })],
    ["a timeout-shaped error", new DOMException("t", "TimeoutError")],
  ])("flags %s", (_case, err) => {
    expect(isTimeoutLike(err)).toBe(true);
  });

  it.each([
    ["a plain upstream failure", new UpstreamError("boom")],
    ["a client abort", new ClientAbortError(ABORT_MESSAGE)],
  ])("does not treat %s as a timeout", (_case, err) => {
    expect(isTimeoutLike(err)).toBe(false);
  });
});

describe("rethrowIfAllAborted", () => {
  const abortedLeg = { status: "rejected", reason: new ClientAbortError(ABORT_MESSAGE) } as const;

  it("rethrows when every leg was aborted by the caller", () => {
    expect(() => rethrowIfAllAborted([abortedLeg])).toThrow(ClientAbortError);
  });

  it("stays quiet when only some legs were aborted", () => {
    expect(() => rethrowIfAllAborted([abortedLeg, { status: "fulfilled", value: 1 }])).not.toThrow();
  });
});
