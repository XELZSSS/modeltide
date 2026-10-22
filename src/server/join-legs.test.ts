import { describe, expect, it, vi } from "vitest";
import { ClientAbortError } from "./api/errors";
import { runLegs } from "./join-legs";

const ok = <T>(label: string, value: T) => ({ label, run: async () => value });
const failing = (label: string, reason: unknown) => ({
  label,
  run: async () => {
    throw reason;
  },
});

describe("runLegs", () => {
  it("keeps values aligned with their legs and reports failures by label", async () => {
    const { values, failures } = await runLegs([ok("a", 1), failing("b", new Error("boom")), ok("c", 3)]);
    expect(values).toEqual([1, undefined, 3]);
    expect(failures.map((failure) => failure.label)).toEqual(["b"]);
  });

  it("reports every failure through onFailure", async () => {
    const onFailure = vi.fn();
    await runLegs([failing("a", new Error("a")), failing("b", new Error("b"))], { onFailure });
    expect(onFailure).toHaveBeenCalledTimes(2);
    expect(onFailure.mock.calls.map(([failure]) => failure.label)).toEqual(["a", "b"]);
  });

  it("rethrows the caller's abort when every leg was aborted", async () => {
    const abort = new ClientAbortError("gone");
    await expect(runLegs([failing("a", abort), failing("b", abort)])).rejects.toBe(abort);
  });

  it("keeps the surviving legs when only some were aborted", async () => {
    const { values, failures } = await runLegs([ok("a", 1), failing("b", new ClientAbortError("gone"))]);
    expect(values).toEqual([1, undefined]);
    expect(failures).toHaveLength(1);
  });

  it("wraps a total failure in a retryable error when a message is supplied", async () => {
    await expect(
      runLegs([failing("a", new Error("x"))], { allFailedMessage: "all feeds failed" }),
    ).rejects.toMatchObject({ name: "UpstreamError", message: "all feeds failed", retryable: true });
  });

  it("does not wrap a partial failure even when a message is supplied", async () => {
    const { failures } = await runLegs([ok("a", 1), failing("b", new Error("x"))], { allFailedMessage: "all failed" });
    expect(failures).toHaveLength(1);
  });

  it("never exceeds the requested concurrency", async () => {
    let active = 0;
    let peak = 0;
    const slow = (label: string) => ({
      label,
      run: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return label;
      },
    });
    const { values } = await runLegs([slow("a"), slow("b"), slow("c"), slow("d")], { concurrency: 2 });
    expect(values).toEqual(["a", "b", "c", "d"]);
    expect(peak).toBe(2);
  });
});
