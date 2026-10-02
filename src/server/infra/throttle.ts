import { KV_READ_WARN_THROTTLE_MS } from "@/server/config/status";

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

export function keyedThrottleGate(intervalMs: number, maxKeys: number): (key: string) => boolean {
  const last = new Map<string, number>();
  return (key) => {
    const now = Date.now();
    const previous = last.get(key);
    if (previous != null && now - previous < intervalMs) return false;
    last.delete(key);
    last.set(key, now);
    pruneBounded(last, maxKeys, (at) => now - at >= intervalMs);
    return true;
  };
}

const SINGLE_GATE_KEY = "gate";

export function throttleGate(intervalMs: number): { open: () => boolean } {
  const gate = keyedThrottleGate(intervalMs, 1);
  return { open: () => gate(SINGLE_GATE_KEY) };
}

export const kvReadWarnGate = throttleGate(KV_READ_WARN_THROTTLE_MS);
