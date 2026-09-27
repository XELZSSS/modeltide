import type { AppContext } from "@/server/context";
import { kvReadWarnGate } from "@/server/config/status";
import { errMsg } from "@/server/infra/task-pool";
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
  if (memoryFirstLaunch != null) return uptimePayload(memoryFirstLaunch, now);
  if (!ctx.kv) return memoryUptime(now);
  let raw: string | null;
  try {
    raw = await ctx.kv.get(FIRST_LAUNCH_KEY);
  } catch (err) {
    if (kvReadWarnGate.open()) ctx.log("warn", `[uptime] KV read failed, using memory: ${errMsg(err)}`);
    return memoryUptime(now);
  }
  let resolved = raw ? Number(raw) : NaN;
  if (!Number.isFinite(resolved)) {
    resolved = now;
    try {
      await ctx.kv.put(FIRST_LAUNCH_KEY, String(resolved));
    } catch (err) {
      if (kvReadWarnGate.open()) ctx.log("warn", `[uptime] failed to persist first launch: ${errMsg(err)}`);
      return uptimePayload(resolved, now);
    }
  }
  memoryFirstLaunch = resolved;
  return uptimePayload(resolved, now);
}
