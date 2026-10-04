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

const interactivePool: SlotPool = { active: 0, waiters: [], max: UPSTREAM_MAX_CONNECTIONS };
const backgroundPool: SlotPool = { active: 0, waiters: [], max: UPSTREAM_BACKGROUND_SLOTS };

export function poolFor(background: boolean): SlotPool {
  return background ? backgroundPool : interactivePool;
}

function poolLimit(pool: SlotPool): number {
  const other = pool === backgroundPool ? interactivePool : backgroundPool;
  return Math.max(0, Math.min(pool.max, UPSTREAM_MAX_CONNECTIONS - other.active));
}

function wakeWaiters(pool: SlotPool): void {
  while (pool.waiters.length > 0 && pool.active < poolLimit(pool)) {
    const next = pool.waiters.shift()!;
    next.detach();
    pool.active += 1;
    next.resolve();
  }
}

export async function acquireSlot(signal: AbortSignal | undefined, pool: SlotPool): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  if (pool.active < poolLimit(pool)) {
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
  pool.active -= 1;
  wakeWaiters(pool);
  wakeWaiters(pool === backgroundPool ? interactivePool : backgroundPool);
}
