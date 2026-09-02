import type { Context } from "hono";
import { MEMORY_RATE_MAX_KEYS, MEMORY_RATE_PRUNE_TO } from "@/shared/config";
import { fnv1aHash } from "@/shared/utils";
import { RateLimitError } from "@/server/infra/errors";

const memoryRateBuckets = new Map<string, { count: number; resetAt: number }>();

function hashIpForKey(raw: string): string {
  return `h${fnv1aHash(raw)}`;
}

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

export async function enforceRateLimit(
  c: Context,
  kv: KVNamespace | undefined,
  rl: { windowSec: number; max: number },
): Promise<void> {
  const viaCfEdge = c.req.header("CF-Ray") != null;
  const cfIp = viaCfEdge ? c.req.header("CF-Connecting-IP")?.trim() : undefined;
  let rawIp: string;
  if (cfIp) {
    rawIp = cfIp;
  } else if (viaCfEdge) {
    const xffRaw = c.req.header("X-Forwarded-For");
    rawIp =
      xffRaw
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .pop() ?? "unknown";
  } else {
    rawIp = "unknown";
  }
  let ip: string;
  if (/[\s\r\n]/.test(rawIp) || rawIp.length > 45 || rawIp === "unknown") {
    ip = rawIp === "unknown" ? "unknown" : hashIpForKey(rawIp.slice(0, 256));
  } else {
    ip = rawIp.slice(0, 45);
  }
  const key = `rl:${c.req.path}:${ip}`;
  const mem = checkMemoryRateLimit(key, rl);
  if (!kv) return;
  if (mem.count * 2 < rl.max) return;
  let current: number;
  try {
    current = Number(await kv.get(key));
  } catch {
    return;
  }
  if (Number.isFinite(current) && current >= rl.max) throw new RateLimitError(undefined, rl.windowSec);
  try {
    await kv.put(key, String(Number.isFinite(current) ? current + 1 : 1), { expirationTtl: rl.windowSec });
  } catch {
    return;
  }
}
