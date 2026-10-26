import { describe, expect, it, vi } from "vitest";
import type { AppContext } from "./api/context";
import { ClientAbortError } from "./api/errors";
import { fanOut } from "./fan-out";
import { failingLeg as failing, okLeg as ok } from "@/test/fixtures";

const stub = () => {
  const log = vi.fn();
  return { ctx: { log } as unknown as AppContext, log };
};
const opts = { tag: "demo" };

describe("fanOut", () => {
  it("keeps the surviving legs and reports the payload as partial", async () => {
    const { ctx } = stub();
    const { values, failures, partial } = await fanOut(ctx, [ok("a", 1), failing("b", new Error("boom"))], opts);
    expect(values).toEqual([1, undefined]);
    expect(failures.map((failure) => failure.label)).toEqual(["b"]);
    expect(partial).toBe(true);
  });

  it("is not partial when every leg succeeded", async () => {
    const { ctx } = stub();
    const { partial } = await fanOut(ctx, [ok("a", 1), ok("b", 2)], opts);
    expect(partial).toBe(false);
  });

  it("logs every failed leg once under the source tag", async () => {
    const { ctx, log } = stub();
    await fanOut(ctx, [failing("a", new Error("a")), failing("b", new Error("b"))], opts);
    expect(log.mock.calls.map(([level, line]) => `${level} ${line}`)).toEqual([
      "warn [demo] a leg failed: a",
      "warn [demo] b leg failed: b",
    ]);
  });

  it("rethrows a caller hang-up even when the other legs succeeded", async () => {
    const { ctx } = stub();
    const abort = new ClientAbortError("gone");
    await expect(fanOut(ctx, [ok("a", 1), failing("b", abort)], opts)).rejects.toBe(abort);
  });
});
