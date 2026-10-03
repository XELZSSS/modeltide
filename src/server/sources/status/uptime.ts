import type { AppContext } from "@/server/context";
import { errMsg } from "@/server/infra/errors";
import { kvReadWarnGate } from "@/server/infra/throttle";
import { FIRST_LAUNCH_KEY } from "./schema";

let memoryFirstLaunch: number | null = null;

export interface UptimePayload {
  firstLaunchAt: string;
  uptimeMs: number;
}

function uptimePayload(firstLaunchMs: number, now: number): UptimePayload {
  return {
    firstLaunchAt: new Date(firstLaunchMs).toISOString(),
    uptimeMs: Math.max(0, now - firstLaunchMs),
  };
}

function memoryUptime(now: number): UptimePayload {
  memoryFirstLaunch ??= now;
  return uptimePayload(memoryFirstLaunch, now);
}

export async function getUptime(ctx: AppContext): Promise<UptimePayload> {
  const now = Date.now();
  if (!ctx.kv) return memoryUptime(now);
  let raw: string | null;
  try {
    raw = await ctx.kv.get(FIRST_LAUNCH_KEY);
  } catch (err) {
    if (kvReadWarnGate.open()) ctx.log("warn", `[uptime] KV read failed, using memory: ${errMsg(err)}`);
    return memoryUptime(now);
  }
  const stored = raw ? Number(raw) : NaN;
  // Guard against corrupted sentinel values ("0"/negative) that would otherwise
  // poison memoryFirstLaunch with a 1970-era timestamp.
  if (Number.isFinite(stored) && stored > 0) {
    memoryFirstLaunch = stored;
    return uptimePayload(stored, now);
  }
  const first = memoryFirstLaunch ?? now;
  memoryFirstLaunch = first;
  try {
    await ctx.kv.put(FIRST_LAUNCH_KEY, String(first));
  } catch (err) {
    if (kvReadWarnGate.open()) ctx.log("warn", `[uptime] failed to persist first launch: ${errMsg(err)}`);
  }
  return uptimePayload(first, now);
}
