import type { Context } from "hono";
import { MEMORY_RATE_MAX_KEYS, MEMORY_RATE_PRUNE_TO } from "@/server/config";
import { RateLimitError } from "@/server/infra/errors";

const memoryRateBuckets = new Map<string, { count: number; resetAt: number }>();

const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^[0-9a-fA-F:]+$/;
const UNKNOWN_BUCKET_DIVISOR = 6;

function pruneMemoryBuckets(now: number): void {
  for (const [k, v] of memoryRateBuckets) {
    if (v.resetAt <= now) memoryRateBuckets.delete(k);
    if (memoryRateBuckets.size <= MEMORY_RATE_PRUNE_TO) break;
  }
  while (memoryRateBuckets.size > MEMORY_RATE_MAX_KEYS) {
    const oldest = memoryRateBuckets.keys().next();
    if (oldest.done) break;
    memoryRateBuckets.delete(oldest.value);
  }
}

function checkMemoryRateLimit(key: string, rl: { windowSec: number; max: number }): { count: number; resetAt: number } {
  const now = Date.now();
  const hit = memoryRateBuckets.get(key);
  if (hit && hit.resetAt > now) {
    if (hit.count >= rl.max) {
      throw new RateLimitError(undefined, Math.max(1, Math.ceil((hit.resetAt - now) / 1000)));
    }
    hit.count += 1;
    return { count: hit.count, resetAt: hit.resetAt };
  }
  if (memoryRateBuckets.size > MEMORY_RATE_MAX_KEYS) pruneMemoryBuckets(now);
  const resetAt = now + rl.windowSec * 1000;
  memoryRateBuckets.set(key, { count: 1, resetAt });
  return { count: 1, resetAt };
}

export function enforceRateLimit(c: Context, rl: { windowSec: number; max: number }): void {
  const cfIp = (c.req.header("CF-Connecting-IP") ?? "").trim();
  const ip =
    cfIp.length > 0 && cfIp.length <= 45 && (IPV4_RE.test(cfIp) || (cfIp.includes(":") && IPV6_RE.test(cfIp)))
      ? cfIp
      : "unknown";
  const max = ip === "unknown" ? Math.max(1, Math.ceil(rl.max / UNKNOWN_BUCKET_DIVISOR)) : rl.max;
  checkMemoryRateLimit(`rl:${c.req.path}:${ip}`, { windowSec: rl.windowSec, max });
}
