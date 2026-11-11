import { THIRTY_MINUTES } from "@/shared/config/time";

const KV_READ_WARN_THROTTLE_MS = THIRTY_MINUTES;

export function pruneBounded<K, V>(map: Map<K, V>, maxKeys: number, isExpired: (value: V) => boolean): void {
  if (map.size <= maxKeys) return;
  for (const [key, value] of map) {
    if (isExpired(value)) map.delete(key);
  }
  while (map.size > maxKeys) {
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
}

/** A single-key gate: the state is one timestamp, not a one-entry `Map`. */
export function throttleGate(intervalMs: number): { open: () => boolean } {
  let lastOpenAt = 0;
  return {
    open: () => {
      const now = Date.now();
      if (now - lastOpenAt < intervalMs) return false;
      lastOpenAt = now;
      return true;
    },
  };
}

export const kvReadWarnGate = throttleGate(KV_READ_WARN_THROTTLE_MS);
