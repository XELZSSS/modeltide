import type { AppContext } from "@/server/context";
import { errMsg } from "@/server/infra/errors";

const FIRST_LAUNCH_KEY = "uptime:first-launch";

let memoryFirstLaunch: number | null = null;

const firstLaunchCache = new WeakMap<object, number>();

export interface UptimePayload {
  firstLaunchAt: string;
  uptimeMs: number;
}

function memoryUptime(now: number): UptimePayload {
  memoryFirstLaunch ??= now;
  return {
    firstLaunchAt: new Date(memoryFirstLaunch).toISOString(),
    uptimeMs: Math.max(0, now - memoryFirstLaunch),
  };
}

export async function getUptime(ctx: AppContext): Promise<UptimePayload> {
  const now = Date.now();
  if (!ctx.kv) return memoryUptime(now);
  const cached = firstLaunchCache.get(ctx.kv);
  if (cached != null) {
    return {
      firstLaunchAt: new Date(cached).toISOString(),
      uptimeMs: Math.max(0, now - cached),
    };
  }
  let raw: string | null;
  try {
    raw = await ctx.kv.get(FIRST_LAUNCH_KEY);
  } catch (err) {
    ctx.log("warn", `[uptime] KV read failed, using memory: ${errMsg(err)}`);
    return memoryUptime(now);
  }
  let firstLaunchMs = raw ? Number(raw) : NaN;
  if (!Number.isFinite(firstLaunchMs)) {
    firstLaunchMs = now;
    try {
      await ctx.kv.put(FIRST_LAUNCH_KEY, String(firstLaunchMs));
    } catch (err) {
      ctx.log("warn", `[uptime] failed to persist first launch: ${errMsg(err)}`);
    }
  }
  firstLaunchCache.set(ctx.kv, firstLaunchMs);

  return {
    firstLaunchAt: new Date(firstLaunchMs).toISOString(),
    uptimeMs: Math.max(0, now - firstLaunchMs),
  };
}
