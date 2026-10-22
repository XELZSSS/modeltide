import { describe, expect, it, vi } from "vitest";
import type { AppContext } from "./api/context";
import { ClientAbortError } from "./api/errors";
import { fanOut } from "./fan-out";

const ok = <T>(label: string, value: T) => ({ label, run: async () => value });
const failing = (label: string, reason: unknown) => ({
  label,
  run: async () => {
    throw reason;
  },
});

const stub = () => {
  const log = vi.fn();
  return { ctx: { log } as unknown as AppContext, log };
};

describe("fanOut", () => {
  it("keeps the surviving legs and reports the payload as partial", async () => {
    const { ctx } = stub();
    const { values, failures, partial, reasons } = await fanOut(ctx, [ok("a", 1), failing("b", new Error("boom"))], {
      tag: "demo",
    });
    expect(values).toEqual([1, undefined]);
    expect(failures.map((failure) => failure.label)).toEqual(["b"]);
    expect(partial).toBe(true);
    expect(reasons).toBe("b: boom");
  });

  it("is not partial when every leg succeeded", async () => {
    const { ctx } = stub();
    const { partial, reasons } = await fanOut(ctx, [ok("a", 1), ok("b", 2)], { tag: "demo" });
    expect(partial).toBe(false);
    expect(reasons).toBe("");
  });

  it("logs every failed leg once under the source tag", async () => {
    const { ctx, log } = stub();
    await fanOut(ctx, [failing("a", new Error("a")), failing("b", new Error("b"))], { tag: "demo" });
    expect(log.mock.calls.map(([level, line]) => `${level} ${line}`)).toEqual([
      "warn [demo] a leg failed: a",
      "warn [demo] b leg failed: b",
    ]);
  });

  it("rethrows a caller hang-up even when the other legs succeeded", async () => {
    const { ctx } = stub();
    const abort = new ClientAbortError("gone");
    await expect(fanOut(ctx, [ok("a", 1), failing("b", abort)], { tag: "demo" })).rejects.toBe(abort);
  });

  it("wraps a total failure in a retryable error when a message is supplied", async () => {
    const { ctx } = stub();
    await expect(
      fanOut(ctx, [failing("a", new Error("x"))], { tag: "demo", allFailedMessage: "all legs failed" }),
    ).rejects.toMatchObject({ name: "UpstreamError", message: "all legs failed", retryable: true });
  });
});
