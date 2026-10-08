import { describe, expect, it } from "vitest";
import { UPSTREAM_MAX_CONNECTIONS } from "@/server/config";
import { acquireSlot, createSlotPools, releaseSlot } from "./connection-pool";

function neverAborted(): AbortSignal {
  return AbortSignal.timeout(30_000);
}

describe("createSlotPools", () => {
  it("isolates invocations: filling one pool leaves another usable", async () => {
    const poolsA = createSlotPools();
    const poolsB = createSlotPools();
    for (let i = 0; i < UPSTREAM_MAX_CONNECTIONS; i++) {
      await acquireSlot(neverAborted(), poolsA, poolsA.interactive);
    }
    // Would hang if pools were a shared singleton.
    await acquireSlot(neverAborted(), poolsB, poolsB.interactive);
    for (let i = 0; i < UPSTREAM_MAX_CONNECTIONS; i++) {
      releaseSlot(poolsA, poolsA.interactive);
    }
    releaseSlot(poolsB, poolsB.interactive);
  });

  it("caps a single pool: the overflow acquire waits for a release", async () => {
    const pools = createSlotPools();
    for (let i = 0; i < UPSTREAM_MAX_CONNECTIONS; i++) {
      await acquireSlot(neverAborted(), pools, pools.interactive);
    }
    let acquired = false;
    const pending = acquireSlot(neverAborted(), pools, pools.interactive).then(() => {
      acquired = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(acquired).toBe(false);
    releaseSlot(pools, pools.interactive);
    await pending;
    expect(acquired).toBe(true);
    for (let i = 0; i < UPSTREAM_MAX_CONNECTIONS; i++) {
      releaseSlot(pools, pools.interactive);
    }
  });
});
