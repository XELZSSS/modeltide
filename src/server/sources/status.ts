import type { AppContext } from "@/server/context";
import { API_DOMAINS, ONE_DAY, ONE_MINUTE, SOURCE_IDS, UPTIME_WARN_RATIO } from "@/shared/config";
import { HISTORY_KV_RETENTION_TTL_S } from "@/server/config";
import { rssConfig, upstreamConfig, upstreamEndpoints } from "@/server/config";
import type { ProbeResult } from "@/server/infra/http-client";
import { errMsg, runCapped } from "@/server/infra/pool";
import type {
  DayBucket,
  SourceHealthLevel,
  SourceHistorySummary,
  SourceLevel,
  SourceStatus,
  StatusEvent,
  StatusHistoryPayload,
  UptimeSample,
} from "@/shared/types";
import { fetchProviderStatuses } from "@/server/sources/provider-status";

const SAMPLE_UPSERT_WINDOW_MS = 4 * ONE_MINUTE;
export const RECENT_WINDOW_MS = ONE_DAY;
export const RETAINED_DAYS = 30;

export type SourceId = SourceStatus["id"];

export interface HistorySourceEntry {
  recent: UptimeSample[];
  daily: DayBucket[];
}

export interface HistoryStore {
  sources: Partial<Record<SourceId, HistorySourceEntry>>;
}

export const emptyEntry = (): HistorySourceEntry => ({ recent: [], daily: [] });

export const utcDay = (t: number): string => new Date(t).toISOString().slice(0, 10);

function samplesInWindow(samples: UptimeSample[], windowStartMs: number): UptimeSample[] {
  return samples.filter((s) => s.t >= windowStartMs);
}

export function uptimeRatio(samples: UptimeSample[], windowStartMs: number): number | null {
  const inWindow = samplesInWindow(samples, windowStartMs);
  if (inWindow.length === 0) return null;
  return inWindow.filter((s) => s.ok).length / inWindow.length;
}

export function avgLatency(samples: UptimeSample[], windowStartMs: number): number | null {
  const values = samplesInWindow(samples, windowStartMs)
    .filter((s) => s.ok && s.latencyMs != null)
    .map((s) => s.latencyMs!);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

interface OpenIncident {
  type: "down" | "degraded";
  at: number;
  index: number;
}

export function deriveEvents(id: SourceId, samples: UptimeSample[]): StatusEvent[] {
  const events: StatusEvent[] = [];
  let open: OpenIncident | null = null;
  const close = (at: number, pushUp: boolean): void => {
    if (open) {
      const ev = events[open.index];
      if (ev) ev.durationMin = Math.round((at - open.at) / ONE_MINUTE);
    }
    if (pushUp) events.push({ id, type: "up", at: new Date(at).toISOString(), durationMin: null });
    open = null;
  };
  for (const sample of samples) {
    const level: SourceLevel = !sample.ok ? "error" : sample.warn === true ? "warn" : "ok";
    if (level === "error") {
      if (open?.type === "degraded") close(sample.t, false);
      if (!open) {
        open = { type: "down", at: sample.t, index: events.length };
        events.push({ id, type: "down", at: new Date(sample.t).toISOString(), durationMin: null });
      }
    } else if (level === "warn") {
      if (open?.type === "down") close(sample.t, true);
      if (!open) {
        open = { type: "degraded", at: sample.t, index: events.length };
        events.push({ id, type: "degraded", at: new Date(sample.t).toISOString(), durationMin: null });
      }
    } else if (open) {
      close(sample.t, true);
    }
  }
  return events;
}

function pruneWindows(recent: UptimeSample[], daily: DayBucket[], now: number): HistorySourceEntry {
  const cutoffDay = utcDay(now - RETAINED_DAYS * ONE_DAY);
  return {
    recent: recent.filter((s) => s.t > now - RECENT_WINDOW_MS),
    daily: daily.filter((b) => b.day >= cutoffDay).slice(-RETAINED_DAYS),
  };
}

export function mergeSample(
  entry: HistorySourceEntry | undefined,
  sample: UptimeSample,
  now: number,
): HistorySourceEntry {
  const prevEntry = entry ?? emptyEntry();
  const recent = [...prevEntry.recent];
  const last = recent.at(-1);
  const isUpsert = last != null && sample.t >= last.t && sample.t - last.t < SAMPLE_UPSERT_WINDOW_MS / 2;
  if (last != null && sample.t <= last.t) return prevEntry;
  if (isUpsert) {
    const lastBucket = prevEntry.daily.find((b) => b.day === utcDay(last.t));
    if (lastBucket) applySampleDelta(lastBucket, last, -1);
    recent[recent.length - 1] = sample;
  } else {
    recent.push(sample);
  }
  const prunedRecent = recent.filter((s) => s.t > now - RECENT_WINDOW_MS);

  const daily = prevEntry.daily.map((b) => ({ ...b }));
  const day = utcDay(sample.t);
  let bucket = daily.find((b) => b.day === day);
  if (!bucket) {
    bucket = { day, total: 0, ok: 0 };
    daily.push(bucket);
  }
  applySampleDelta(bucket, sample, 1);

  return pruneWindows(prunedRecent, daily, now);
}

function applySampleDelta(bucket: DayBucket, sample: UptimeSample, dir: 1 | -1): void {
  bucket.total = Math.max(0, bucket.total + dir);
  if (sample.ok) {
    bucket.ok = Math.max(0, bucket.ok + dir);
  }
}

const FIRST_LAUNCH_KEY = "uptime:first-launch";

let memoryFirstLaunch: number | null = null;

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

  return {
    firstLaunchAt: new Date(firstLaunchMs).toISOString(),
    uptimeMs: Math.max(0, now - firstLaunchMs),
  };
}

export interface ProbeTarget {
  id: SourceStatus["id"];
  url: string;
}

export function buildTargets(): ProbeTarget[] {
  const newsTargets = (Object.keys(rssConfig) as (keyof typeof rssConfig)[]).flatMap((category) =>
    rssConfig[category].map((url): ProbeTarget => ({ id: "news", url })),
  );
  return [
    {
      id: "artificialAnalysis",
      url: `${upstreamConfig.artificialAnalysis}${upstreamEndpoints.aaIndex}`,
    },
    { id: "openrouter", url: `${upstreamConfig.openrouter}${upstreamEndpoints.openRouterDirectory}` },
    { id: "openrouter", url: `${upstreamConfig.openrouter}${upstreamEndpoints.openRouterRankings}` },
    {
      id: "artificialAnalysis",
      url: `${upstreamConfig.artificialAnalysis}${upstreamEndpoints.aaTextToImage}`,
    },
    { id: "huggingface", url: `${upstreamConfig.huggingface}?limit=1` },
    { id: "arena", url: `${upstreamConfig.arena}${upstreamEndpoints.agentBoard}` },
    ...newsTargets,
    {
      id: "news",
      url: `${upstreamConfig.huggingfaceSite}${upstreamEndpoints.hfDailyPapers}`,
    },
  ];
}

export async function probeTargets(ctx: AppContext): Promise<{ target: ProbeTarget; probe: ProbeResult }[]> {
  const PROBE_CONCURRENCY = 6;
  const probed = await runCapped(
    buildTargets().map((target) => async () => ({ target, probe: await ctx.http.probe(target.url) })),
    PROBE_CONCURRENCY,
  );
  return probed.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}

export interface SourceAggregate {
  ok: boolean;
  warn?: boolean;
  status: number | null;
  latencyMs: number | null;
  error: string | null;
}

export function aggregateProbes(
  probed: { target: ProbeTarget; probe: ProbeResult }[],
): Map<SourceStatus["id"], SourceAggregate> {
  type Mutable = SourceAggregate & { total: number; failures: number; firstError: string | null };
  const grouped = new Map<SourceStatus["id"], Mutable>();

  for (const { target, probe } of probed) {
    if (!probe.ok && probe.status == null) continue;
    let g = grouped.get(target.id);
    if (!g) {
      g = { ok: false, status: null, latencyMs: null, error: null, total: 0, failures: 0, firstError: null };
      grouped.set(target.id, g);
    }
    g.total += 1;
    if (probe.ok) {
      g.ok = true;
      g.status ??= probe.status;
      if (probe.latencyMs != null && (g.latencyMs == null || probe.latencyMs < g.latencyMs)) {
        g.latencyMs = probe.latencyMs;
      }
    } else {
      g.failures += 1;
      g.firstError ??= probe.error;
    }
  }

  const aggregated = new Map<SourceStatus["id"], SourceAggregate>();
  for (const [id, g] of grouped) {
    aggregated.set(id, {
      ok: g.ok,
      status: g.status,
      latencyMs: g.latencyMs,
      error: g.ok ? null : g.total > 1 ? `${g.failures}/${g.total} feeds failed` : g.firstError,
    });
  }
  return aggregated;
}

const SAMPLE_LOCK_TTL_S = 120;
const LOCK_CONFIRM_DELAY_MS = 100;
export const SAMPLE_LOCK_KEY = `${API_DOMAINS.statusHistory}:lock`;

function isValidSample(s: unknown): s is UptimeSample {
  if (!s || typeof s !== "object" || Array.isArray(s)) return false;
  const r = s as Record<string, unknown>;
  return typeof r.t === "number" && Number.isFinite(r.t) && typeof r.ok === "boolean";
}
function isValidBucket(b: unknown): b is DayBucket {
  if (!b || typeof b !== "object" || Array.isArray(b)) return false;
  const r = b as Record<string, unknown>;
  return typeof r.day === "string" && typeof r.total === "number" && typeof r.ok === "number";
}

async function acquireSampleLock(ctx: AppContext): Promise<string | null> {
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
    await new Promise((resolve) => setTimeout(resolve, LOCK_CONFIRM_DELAY_MS));
    const confirmed = await ctx.kv.get(SAMPLE_LOCK_KEY);
    if (confirmed && confirmed !== value && isLiveLock(confirmed)) return null;
    return token;
  } catch {
    return null;
  }
}

async function releaseSampleLock(ctx: AppContext, token: string | null): Promise<void> {
  if (!ctx.kv || !token || token === "memory") return;
  try {
    const held = await ctx.kv.get(SAMPLE_LOCK_KEY);
    if (held && held.startsWith(`${token}:`)) {
      await ctx.kv.delete(SAMPLE_LOCK_KEY);
    }
  } catch {}
}

export const HISTORY_KEY = API_DOMAINS.statusHistory;
export const HISTORY_BACKUP_KEY = `${HISTORY_KEY}:backup`;
let memoryStore: HistoryStore = { sources: {} };

async function collectHistoryRaws(kv: NonNullable<AppContext["kv"]>): Promise<{ key: string; raw: string }[]> {
  const stableRaw = await kv.get(HISTORY_KEY);
  if (stableRaw != null) return [{ key: HISTORY_KEY, raw: stableRaw }];
  return [];
}

const KV_READ_WARN_THROTTLE_MS = 30 * 60 * 1000;
let lastKvReadWarnAt = 0;

function warnKvReadFailure(ctx: AppContext, err: unknown): void {
  const now = Date.now();
  if (now - lastKvReadWarnAt < KV_READ_WARN_THROTTLE_MS) return;
  lastKvReadWarnAt = now;
  ctx.log(
    "warn",
    `[status-history] KV read failed, serving memory: ${err instanceof Error ? err.message : String(err)}`,
  );
}

export async function readStore(ctx: AppContext): Promise<HistoryStore> {
  if (!ctx.kv) return memoryStore;
  let raws: { key: string; raw: string }[];
  try {
    raws = await collectHistoryRaws(ctx.kv);
  } catch (err) {
    warnKvReadFailure(ctx, err);
    return memoryStore;
  }
  for (const { raw } of raws) {
    try {
      const parsed: unknown = JSON.parse(raw);
      const salvaged = salvageStore(parsed);
      if (salvaged) return salvaged;
    } catch {
      continue;
    }
  }
  if (raws.length === 0) return Object.keys(memoryStore.sources).length > 0 ? memoryStore : { sources: {} };
  try {
    await ctx.kv.put(HISTORY_BACKUP_KEY, JSON.stringify(raws.map((r) => r.raw)).slice(0, 24 * 1024 * 1024), {
      expirationTtl: HISTORY_KV_RETENTION_TTL_S,
    });
    await Promise.all(raws.map(({ key }) => ctx.kv!.delete(key)));
  } catch (err) {
    ctx.log(
      "warn",
      `[status-history] history backup write failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return Object.keys(memoryStore.sources).length > 0 ? memoryStore : { sources: {} };
}

function salvageStore(parsed: unknown): HistoryStore | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const sources = (parsed as { sources?: unknown }).sources;
  if (!sources || typeof sources !== "object" || Array.isArray(sources)) return null;
  const out: HistoryStore["sources"] = {};
  for (const [id, entry] of Object.entries(sources as Record<string, unknown>)) {
    if (entry == null) continue;
    if (typeof entry !== "object" || Array.isArray(entry)) continue;
    const { recent, daily } = entry as { recent?: unknown; daily?: unknown };
    if (!Array.isArray(recent) || !Array.isArray(daily)) continue;
    if (!recent.every(isValidSample) || !daily.every(isValidBucket)) continue;
    out[id as SourceId] = { recent, daily };
  }
  return Object.keys(out).length > 0 ? { sources: out } : null;
}

export async function recordStatusSamples(ctx: AppContext, now = Date.now()): Promise<boolean | null> {
  const token = await acquireSampleLock(ctx);
  if (!token) return null;
  try {
    const [probed, providerResults] = await Promise.all([probeTargets(ctx), fetchProviderStatuses(ctx)]);
    const aggregates = aggregateProbes(probed);
    for (const [id, result] of providerResults) {
      aggregates.set(id, {
        ok: result.ok,
        ...(result.warn ? { warn: true } : {}),
        status: result.status,
        latencyMs: result.ok ? result.latencyMs : null,
        error: result.error,
      });
    }
    if (aggregates.size === 0) return false;
    await mergeSamplesIntoStore(ctx, aggregates, now);
    return true;
  } finally {
    await releaseSampleLock(ctx, token);
  }
}

async function mergeSamplesIntoStore(
  ctx: AppContext,
  aggregates: Map<SourceId, SourceAggregate>,
  now = Date.now(),
): Promise<HistoryStore> {
  const store = await readStore(ctx);
  if (aggregates.size === 0) return store;
  for (const [id, agg] of aggregates) {
    store.sources[id] = mergeSample(
      store.sources[id],
      {
        t: now,
        ok: agg.ok,
        latencyMs: agg.latencyMs,
        status: agg.status,
        error: agg.error,
        ...(agg.warn ? { warn: true } : {}),
      },
      now,
    );
  }
  if (!ctx.kv) {
    memoryStore = store;
    return store;
  }
  try {
    await ctx.kv.put(HISTORY_KEY, JSON.stringify(store), { expirationTtl: HISTORY_KV_RETENTION_TTL_S });
  } catch (err) {
    ctx.log(
      "warn",
      `[status-history] KV write failed, serving memory: ${err instanceof Error ? err.message : String(err)}`,
    );
    memoryStore = store;
  }
  return store;
}

export async function ensureFreshSamples(ctx: AppContext): Promise<HistoryStore> {
  let store: HistoryStore;
  try {
    store = await readStore(ctx);
  } catch {
    return memoryStore;
  }
  if (ctx.kv) warnStaleSamples(ctx, store);
  return store;
}

const STALE_SAMPLE_WARN_MS = 2 * 60 * 60 * 1000;
const STALE_WARN_THROTTLE_MS = 30 * 60 * 1000;
let lastStaleWarnAt = 0;

export function latestSampleAt(store: HistoryStore): number {
  let latest = 0;
  for (const entry of Object.values(store.sources)) {
    const t = entry?.recent.at(-1)?.t ?? 0;
    if (t > latest) latest = t;
  }
  return latest;
}

function warnStaleSamples(ctx: AppContext, store: HistoryStore): void {
  const now = Date.now();
  const latest = latestSampleAt(store);
  if (latest === 0 || now - latest <= STALE_SAMPLE_WARN_MS) return;
  if (now - lastStaleWarnAt < STALE_WARN_THROTTLE_MS) return;
  lastStaleWarnAt = now;
  ctx.log("warn", "[status-history] samples are stale: sampling cron may be dead", {
    latestSampleAt: new Date(latest).toISOString(),
    ageHours: Math.round((now - latest) / 3_600_000),
  });
}

const MAX_EVENTS = 50;

function buildSourceSummary(id: SourceId, entry: HistorySourceEntry, now: number): SourceHistorySummary {
  const last = entry.recent[entry.recent.length - 1];
  const buckets = entry.daily.slice(-7);
  const sumOk = buckets.reduce((a, b) => a + b.ok, 0);
  const sumTotal = buckets.reduce((a, b) => a + b.total, 0);
  const retained = entry.daily.slice(-RETAINED_DAYS);
  const total30 = retained.reduce((a, b) => a + b.total, 0);
  const uptime24h = uptimeRatio(entry.recent, now - RECENT_WINDOW_MS);
  let level: SourceHealthLevel;
  if (!last) level = "unknown";
  else if (!last.ok) level = "error";
  else if (last.warn === true || (uptime24h != null && uptime24h < UPTIME_WARN_RATIO)) level = "warn";
  else level = "ok";
  return {
    id,
    ok: last ? last.ok : false,
    level,
    latencyMs: last ? last.latencyMs : null,
    checkedAt: last ? new Date(last.t).toISOString() : null,
    uptime24h,
    uptime7d: sumTotal > 0 ? sumOk / sumTotal : null,
    uptime30d: total30 > 0 ? retained.reduce((a, b) => a + b.ok, 0) / total30 : null,
    avgLatency24h: avgLatency(entry.recent, now - RECENT_WINDOW_MS),
  };
}

export function buildHistoryPayload(
  store: HistoryStore,
  uptime: UptimePayload,
  now = Date.now(),
  persisted = true,
): StatusHistoryPayload {
  const ids: SourceId[] = [...SOURCE_IDS];
  const recent: StatusHistoryPayload["recent"] = {};
  const daily: StatusHistoryPayload["daily"] = {};
  const sources: SourceHistorySummary[] = [];
  const events: StatusEvent[] = [];

  for (const id of ids) {
    const entry = store.sources[id] ?? emptyEntry();
    recent[id] = [...entry.recent];
    daily[id] = [...entry.daily];
    events.push(...deriveEvents(id, entry.recent));
    sources.push(buildSourceSummary(id, entry, now));
  }

  events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return {
    firstLaunchAt: uptime.firstLaunchAt,
    uptimeMs: uptime.uptimeMs,
    sources,
    recent,
    daily,
    events: events.slice(0, MAX_EVENTS),
    generatedAt: new Date(now).toISOString(),
    persisted,
  };
}
