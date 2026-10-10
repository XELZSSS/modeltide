import { UPSTREAM_BACKGROUND_SLOTS, UPSTREAM_MAX_CONNECTIONS } from "@/server/config";

interface SlotWaiter {
  resolve: () => void;
  detach: () => void;
}

export interface SlotPool {
  active: number;
  waiters: SlotWaiter[];
  max: number;
}

export interface SlotPools {
  interactive: SlotPool;
  background: SlotPool;
}

// Pools are per HttpClient (i.e. per invocation), not global singletons: the
// platform budget is 6 simultaneous connections *per invocation*, so independent
// invocations sharing one pool starve each other while each stays under budget.
export function createSlotPools(): SlotPools {
  return {
    interactive: { active: 0, waiters: [], max: UPSTREAM_MAX_CONNECTIONS },
    background: { active: 0, waiters: [], max: UPSTREAM_BACKGROUND_SLOTS },
  };
}

function poolLimit(pool: SlotPool, sibling: SlotPool): number {
  return Math.max(0, Math.min(pool.max, UPSTREAM_MAX_CONNECTIONS - sibling.active));
}

function wakeWaiters(pools: SlotPools, pool: SlotPool): void {
  const sibling = pool === pools.background ? pools.interactive : pools.background;
  while (pool.waiters.length > 0 && pool.active < poolLimit(pool, sibling)) {
    const next = pool.waiters.shift()!;
    next.detach();
    pool.active += 1;
    next.resolve();
  }
}

export async function acquireSlot(
  signal: AbortSignal | undefined,
  pools: SlotPools,
  pool: SlotPool,
): Promise<void> {
  const sibling = pool === pools.background ? pools.interactive : pools.background;
  if (signal?.aborted) return Promise.reject(signal.reason);
  if (pool.active < poolLimit(pool, sibling)) {
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

export function releaseSlot(pools: SlotPools, pool: SlotPool): void {
  if (pool.active > 0) pool.active -= 1;
  wakeWaiters(pools, pool);
  wakeWaiters(pools, pool === pools.background ? pools.interactive : pools.background);
}
