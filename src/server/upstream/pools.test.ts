import { describe, expect, it } from "vitest";
import { acquireSlot, createSlotPool, releaseSlot, type SlotPool } from "./pools";
import { UPSTREAM_MAX_CONNECTIONS } from "./timeouts";

async function fillPool(pool: SlotPool): Promise<void> {
  for (let i = 0; i < pool.max; i++) await acquireSlot(undefined, pool);
}

describe("createSlotPool", () => {
  it("starts empty and capped at UPSTREAM_MAX_CONNECTIONS", () => {
    const pool = createSlotPool();
    expect(pool.max).toBe(UPSTREAM_MAX_CONNECTIONS);
    expect(pool.active).toBe(0);
    expect(pool.waiters).toHaveLength(0);
  });
});

describe("acquireSlot / releaseSlot", () => {
  it("queues an acquire past the cap until a slot is released", async () => {
    const pool = createSlotPool();
    await fillPool(pool);
    expect(pool.active).toBe(UPSTREAM_MAX_CONNECTIONS);

    let settled = false;
    const pending = acquireSlot(undefined, pool).then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(pool.waiters).toHaveLength(1);
    expect(pool.active).toBe(UPSTREAM_MAX_CONNECTIONS);

    releaseSlot(pool);
    await pending;
    expect(settled).toBe(true);
    expect(pool.waiters).toHaveLength(0);
    expect(pool.active).toBe(UPSTREAM_MAX_CONNECTIONS);
  });

  it("wakes queued waiters in FIFO order", async () => {
    const pool = createSlotPool();
    await fillPool(pool);

    const order: string[] = [];
    const a = acquireSlot(undefined, pool).then(() => order.push("a"));
    const b = acquireSlot(undefined, pool).then(() => order.push("b"));
    const c = acquireSlot(undefined, pool).then(() => order.push("c"));
    await Promise.resolve();
    expect(pool.waiters).toHaveLength(3);

    releaseSlot(pool);
    await a;
    expect(order).toEqual(["a"]);
    releaseSlot(pool);
    await b;
    expect(order).toEqual(["a", "b"]);
    releaseSlot(pool);
    await c;
    expect(order).toEqual(["a", "b", "c"]);
    expect(pool.active).toBe(UPSTREAM_MAX_CONNECTIONS);
  });

  it("rejects a queued waiter on abort and removes it from the queue", async () => {
    const pool = createSlotPool();
    await fillPool(pool);

    const controller = new AbortController();
    const reason = new DOMException("handed up", "AbortError");
    const pending = acquireSlot(controller.signal, pool);
    await Promise.resolve();
    expect(pool.waiters).toHaveLength(1);

    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
    expect(pool.waiters).toHaveLength(0);

    releaseSlot(pool);
    expect(pool.waiters).toHaveLength(0);
    expect(pool.active).toBeLessThanOrEqual(UPSTREAM_MAX_CONNECTIONS);
  });

  it("rejects immediately for an already-aborted signal without queueing", async () => {
    const pool = createSlotPool();
    const controller = new AbortController();
    const reason = new DOMException("handed up", "AbortError");
    controller.abort(reason);

    await expect(acquireSlot(controller.signal, pool)).rejects.toBe(reason);
    expect(pool.waiters).toHaveLength(0);
    expect(pool.active).toBe(0);
  });

  it("never lets active go below zero on a stray release", () => {
    const pool = createSlotPool();
    releaseSlot(pool);
    expect(pool.active).toBe(0);
  });
});
