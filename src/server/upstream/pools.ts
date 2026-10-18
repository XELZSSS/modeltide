import { UPSTREAM_MAX_CONNECTIONS } from "./timeouts";

interface SlotWaiter {
  resolve: () => void;
  detach: () => void;
}

export interface SlotPool {
  active: number;
  waiters: SlotWaiter[];
  max: number;
}

// One pool per invocation, not a global singleton: the platform budget is 6 connections per invocation.
export function createSlotPool(): SlotPool {
  return { active: 0, waiters: [], max: UPSTREAM_MAX_CONNECTIONS };
}

function wakeWaiters(pool: SlotPool): void {
  while (pool.waiters.length > 0 && pool.active < pool.max) {
    const next = pool.waiters.shift()!;
    next.detach();
    pool.active += 1;
    next.resolve();
  }
}

export async function acquireSlot(signal: AbortSignal | undefined, pool: SlotPool): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  if (pool.active < pool.max) {
    pool.active += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const waiter: SlotWaiter = { resolve, detach: () => {} };
    if (signal) {
      const onAbort = (): void => {
        const i = pool.waiters.indexOf(waiter);
        if (i !== -1) pool.waiters.splice(i, 1);
        reject(signal.reason);
      };
      waiter.detach = () => signal.removeEventListener("abort", onAbort);
      signal.addEventListener("abort", onAbort, { once: true });
    }
    pool.waiters.push(waiter);
  });
}

export function releaseSlot(pool: SlotPool): void {
  if (pool.active > 0) pool.active -= 1;
  wakeWaiters(pool);
}
