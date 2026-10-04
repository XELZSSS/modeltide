import { SAMPLE_LOCK_TTL_S } from "@/server/config/status";
import type { AppContext } from "@/server/context";
import { errMsg } from "@/server/infra/errors";
import { SAMPLE_LOCK_KEY } from "./schema";

export async function acquireSampleLock(ctx: AppContext): Promise<string | null> {
  if (!ctx.kv) return "memory";
  const rand = crypto.getRandomValues(new Uint32Array(1))[0]!;
  const token = `${Date.now()}:${rand.toString(36)}`;
  const expiresAt = Date.now() + SAMPLE_LOCK_TTL_S * 1000;
  const value = `${token}:${expiresAt}`;
  const isLiveLock = (held: string): boolean => {
    const heldExpiry = Number(held.split(":").at(-1));
    return Number.isFinite(heldExpiry) && heldExpiry > Date.now();
  };
  try {
    const held = await ctx.kv.get(SAMPLE_LOCK_KEY);
    if (held && isLiveLock(held)) return null;
    await ctx.kv.put(SAMPLE_LOCK_KEY, value, { expirationTtl: SAMPLE_LOCK_TTL_S });
    return token;
  } catch (err) {
    ctx.log("warn", `[status-history] sample lock acquire failed: ${errMsg(err)}`);
    throw err;
  }
}

export async function releaseSampleLock(ctx: AppContext, token: string | null): Promise<void> {
  if (!ctx.kv || !token || token === "memory") return;
  try {
    const held = await ctx.kv.get(SAMPLE_LOCK_KEY);
    if (held && held.startsWith(`${token}:`)) {
      await ctx.kv.delete(SAMPLE_LOCK_KEY);
    }
  } catch (err) {
    ctx.log("warn", `[status-history] sample lock release failed, leaving to TTL expiry: ${errMsg(err)}`);
  }
}
