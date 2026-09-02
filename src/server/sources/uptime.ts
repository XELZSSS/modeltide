import type { AppContext } from "@/server/context";
import { errMsg } from "@/server/infra/utils";

const FIRST_LAUNCH_KEY = "uptime:first-launch";

// In-memory fallback when KV is not configured (per-isolate, lost on restart — expected without persistence)
let memoryFirstLaunch: number | null = null;

interface UptimePayload {
  firstLaunchAt: string;
  uptimeMs: number;
}

export async function getUptime(ctx: AppContext): Promise<UptimePayload> {
  const now = Date.now();
  if (!ctx.kv) {
    memoryFirstLaunch ??= now;
    return {
      firstLaunchAt: new Date(memoryFirstLaunch).toISOString(),
      uptimeMs: Math.max(0, now - memoryFirstLaunch),
    };
  }
  let raw: string | null;
  try {
    raw = await ctx.kv.get(FIRST_LAUNCH_KEY);
  } catch (err) {
    ctx.log("warn", `[uptime] KV read failed, using memory: ${errMsg(err)}`);
    memoryFirstLaunch ??= now;
    return {
      firstLaunchAt: new Date(memoryFirstLaunch).toISOString(),
      uptimeMs: Math.max(0, now - memoryFirstLaunch),
    };
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

  return {
    firstLaunchAt: new Date(firstLaunchMs).toISOString(),
    uptimeMs: Math.max(0, now - firstLaunchMs),
  };
}
