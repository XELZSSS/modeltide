import type { AppContext } from "@/server/context";
import { upstreamConfig, rssConfig } from "@/shared/config";
import { SOURCE_IDS, ONE_DAY, ONE_MINUTE } from "@/shared/config";
import { errMsg, type ProbeResult } from "@/server/infra";
import { INDEX_PATH } from "@/server/sources/artificial-analysis";
import type { DayBucket, UptimeSample, StatusEvent, SourceHistorySummary, StatusHistoryPayload } from "@/shared/types";
import type { SourceStatus } from "@/shared/types";

/**
 * Rolling history of probe samples for every data source, persisted in a single KV
 * key and appended by the cron scheduler (~1 write per tick — well inside KV's
 * 1 write/second-per-key limit). Two co-located windows:
 *  - recent: raw samples for the last 24h (latency chart, event timeline)
 *  - daily:  per-UTC-day rollups for the last 90 days (uptime percentages)
 */

export const HISTORY_KEY = "status:history:v2";
export const SAMPLE_INTERVAL_MS = 4 * ONE_MINUTE;
export const RECENT_WINDOW_MS = ONE_DAY;
export const RETAINED_DAYS = 90;
export const MAX_EVENTS = 50;
// Outlives one sampling round (~seconds) but expires well before the next tick,
// so a crashed sampler cannot wedge the store permanently.
export const SAMPLE_LOCK_TTL_S = 120;

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

/** Uptime ratio over the samples inside a window; null when the window has no samples. */
export function uptimeRatio(samples: UptimeSample[], windowStartMs: number): number | null {
  const inWindow = samplesInWindow(samples, windowStartMs);
  if (inWindow.length === 0) return null;
  return inWindow.filter((s) => s.ok).length / inWindow.length;
}

/** Average successful-probe latency over the samples inside a window; null when none succeeded. */
export function avgLatency(samples: UptimeSample[], windowStartMs: number): number | null {
  const values = samplesInWindow(samples, windowStartMs)
    .filter((s) => s.ok && s.latencyMs != null)
    .map((s) => s.latencyMs!);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Derive state transitions from one source's samples (oldest first). A failing sample
 * opens a "down" event — including a failing first sample, where the outage start is
 * simply unknown — and the next healthy sample closes it and adds an "up" event.
 */
export function deriveEvents(id: SourceId, samples: UptimeSample[]): StatusEvent[] {
  const events: StatusEvent[] = [];
  let downAt: number | null = null;
  let openDownIndex = -1;
  for (const sample of samples) {
    if (!sample.ok && downAt == null) {
      downAt = sample.t;
      openDownIndex = events.length;
      events.push({ id, type: "down", at: new Date(sample.t).toISOString(), durationMin: null });
    } else if (sample.ok && downAt != null) {
      const down = events[openDownIndex];
      if (down) down.durationMin = Math.round((sample.t - downAt) / ONE_MINUTE);
      events.push({ id, type: "up", at: new Date(sample.t).toISOString(), durationMin: null });
      downAt = null;
      openDownIndex = -1;
    }
  }
  return events;
}

/** True when a sample is a new incident: failing with no previous sample or a previous healthy one. */
function isNewIncident(prev: UptimeSample | undefined, sample: UptimeSample): boolean {
  return !sample.ok && (prev === undefined || prev.ok);
}

/** Drop samples/buckets outside the rolling windows (24h recent, 90 daily buckets). */
function pruneWindows(recent: UptimeSample[], daily: DayBucket[], now: number): HistorySourceEntry {
  const cutoffDay = utcDay(now - RETAINED_DAYS * ONE_DAY);
  return {
    recent: recent.filter((s) => s.t > now - RECENT_WINDOW_MS),
    daily: daily.filter((b) => b.day >= cutoffDay).slice(-RETAINED_DAYS),
  };
}

/** Merge one probe sample into a source's rolling windows (pure). */
export function mergeSample(
  entry: HistorySourceEntry | undefined,
  sample: UptimeSample,
  now: number,
): HistorySourceEntry {
  const prevEntry = entry ?? emptyEntry();
  const recent = [...prevEntry.recent];
  const last = recent[recent.length - 1];
  // Re-serialised cron runs may land inside the same interval: upsert instead of duplicating.
  // Upserts replace the sample but must NOT double-count the daily bucket.
  // Only newer samples within half an interval upsert; older ones are ignored below.
  const isUpsert = last != null && sample.t >= last.t && sample.t - last.t < SAMPLE_INTERVAL_MS / 2;
  // Stale/retried sample older than the newest stored one: ignore to avoid time travel.
  if (last != null && sample.t <= last.t) return prevEntry;
  if (isUpsert) {
    recent[recent.length - 1] = sample;
  } else {
    recent.push(sample);
  }
  const prunedRecent = recent.filter((s) => s.t > now - RECENT_WINDOW_MS);

  const daily = prevEntry.daily.map((b) => ({ ...b }));
  const day = utcDay(sample.t);
  const prevSample = last && last.t < sample.t ? last : undefined;
  let bucket = daily.find((b) => b.day === day);
  if (!bucket) {
    bucket = { day, total: 0, ok: 0, latencySum: 0, latencyN: 0, incidents: 0 };
    daily.push(bucket);
  }
  // Upserts already counted this interval: skip daily accumulation to avoid dilution.
  if (isUpsert) return pruneWindows(recent, daily, now);
  bucket.total += 1;
  if (sample.ok) {
    bucket.ok += 1;
    if (sample.latencyMs != null) {
      bucket.latencySum += sample.latencyMs;
      bucket.latencyN += 1;
    }
  }
  if (isNewIncident(prevSample, sample)) bucket.incidents += 1;

  return pruneWindows(prunedRecent, daily, now);
}

export interface ProbeTarget {
  id: SourceStatus["id"];
  url: string;
}

export function buildTargets(): ProbeTarget[] {
  // Health sampling: one representative feed per news category (4 probes)
  // instead of all 19. A category is healthy when any feed responds, and the
  // full fan-out already happens on the /api/news path — probing everything
  // every 4 minutes would cost ~7k upstream GETs/day and risk the 50-subrequest
  // Workers limit when combined with warmup traffic.
  const newsSample = Object.values(rssConfig)
    .map((feeds) => feeds[0])
    .filter((v): v is string => !!v);
  return [
    {
      id: "artificialAnalysis",
      url: `${upstreamConfig.artificialAnalysis}${INDEX_PATH}`,
    },
    { id: "huggingface", url: `${upstreamConfig.huggingface}?limit=1` },
    { id: "openrouter", url: `${upstreamConfig.openrouter}/api/v1/models` },
    // Same page the rankings source scrapes; probe() cancels the body without
    // reading it, so the ~3MB page costs one lightweight GET per round.
    { id: "arena", url: `${upstreamConfig.arena}/leaderboard/text` },
    // Same first-party doc pages the official-pricing source scrapes; the source
    // is healthy when any provider responds (news.ts precedent for fan-out health).
    { id: "officialPricing", url: `${upstreamConfig.openai}/api/docs/pricing.md` },
    { id: "officialPricing", url: `${upstreamConfig.anthropic}/docs/en/about-claude/pricing` },
    { id: "officialPricing", url: `${upstreamConfig.googleCloud}/vertex-ai/generative-ai/pricing` },
    { id: "officialPricing", url: `${upstreamConfig.deepseekDocs}/quick_start/pricing` },
    { id: "officialPricing", url: `${upstreamConfig.mistral}/pricing/api/` },
    { id: "officialPricing", url: `${upstreamConfig.moonshot}/docs/pricing` },
    ...newsSample.map((url): ProbeTarget => ({ id: "news", url })),
  ];
}

/** One probe round over every target; results always fulfil (probe failures come back as ok:false). */
export async function probeTargets(ctx: AppContext): Promise<{ target: ProbeTarget; probe: ProbeResult }[]> {
  return Promise.all(buildTargets().map(async (target) => ({ target, probe: await ctx.http.probe(target.url) })));
}

/** Aggregated health for one source across all of its probe targets. */
export interface SourceAggregate {
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  /** Human-readable failure reason; null when healthy. */
  error: string | null;
}

/**
 * Fold a probe round into one aggregate per source: a source is healthy when any
 * of its probes succeeds (the last successful probe donates status and latency),
 * otherwise the error summarizes how many feeds failed.
 */
export function aggregateProbes(
  probed: { target: ProbeTarget; probe: ProbeResult }[],
): Map<SourceStatus["id"], SourceAggregate> {
  type Mutable = SourceAggregate & { total: number; failures: number; firstError: string | null };
  const grouped = new Map<SourceStatus["id"], Mutable>();

  for (const { target, probe } of probed) {
    let g = grouped.get(target.id);
    if (!g) {
      g = { ok: false, status: null, latencyMs: null, error: null, total: 0, failures: 0, firstError: null };
      grouped.set(target.id, g);
    }
    g.total += 1;
    if (probe.ok) {
      g.ok = true;
      g.status = probe.status;
      g.latencyMs = probe.latencyMs;
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

const FIRST_LAUNCH_KEY = "uptime:first-launch";

// In-memory fallback when KV is not configured (per-isolate, lost on restart — expected without persistence)
let memoryFirstLaunch: number | null = null;

interface UptimePayload {
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

function buildSourceSummary(id: SourceId, entry: HistorySourceEntry, now: number): SourceHistorySummary {
  const last = entry.recent[entry.recent.length - 1];
  const day7Cutoff = now - 7 * ONE_DAY;
  const buckets = entry.daily.filter((b) => b.day >= utcDay(day7Cutoff));
  const sumOk = buckets.reduce((a, b) => a + b.ok, 0);
  const sumTotal = buckets.reduce((a, b) => a + b.total, 0);
  const total90 = entry.daily.reduce((a, b) => a + b.total, 0);
  return {
    id,
    ok: last ? last.ok : false,
    latencyMs: last ? last.latencyMs : null,
    checkedAt: last ? new Date(last.t).toISOString() : null,
    uptime24h: uptimeRatio(entry.recent, now - RECENT_WINDOW_MS),
    uptime7d: sumTotal > 0 ? sumOk / sumTotal : null,
    uptime90d: total90 > 0 ? entry.daily.reduce((a, b) => a + b.ok, 0) / total90 : null,
    avgLatency24h: avgLatency(entry.recent, now - RECENT_WINDOW_MS),
  };
}

/** Build the client payload: per-source summaries, raw windows and the merged event timeline. */
export function buildHistoryPayload(
  store: HistoryStore,
  uptime: { firstLaunchAt: string; uptimeMs: number },
  now = Date.now(),
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
  };
}

const SAMPLE_LOCK_KEY = "status:history:lock";

// In-memory fallback when KV is not configured (graceful degradation per docs)
// Docs: https://developers.cloudflare.com/kv/concepts/kv-bindings/ — env.CACHE is undefined when kv_namespaces is not configured
let memoryStore: HistoryStore = { sources: {} };

async function acquireSampleLock(ctx: AppContext): Promise<boolean> {
  if (!ctx.kv) return true;
  try {
    const held = await ctx.kv.get(SAMPLE_LOCK_KEY);
    if (held) return false;
    await ctx.kv.put(SAMPLE_LOCK_KEY, "1", { expirationTtl: SAMPLE_LOCK_TTL_S });
    return true;
  } catch {
    // Best-effort lock: KV hiccup must not block sampling.
    return true;
  }
}

async function releaseSampleLock(ctx: AppContext): Promise<void> {
  if (!ctx.kv) return;
  try {
    await ctx.kv.delete(SAMPLE_LOCK_KEY);
  } catch {
    // Lock expires via TTL; ignore delete failures.
  }
}

function isValidStoreShape(v: unknown): v is HistoryStore {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const sources = (v as { sources?: unknown }).sources;
  if (!sources || typeof sources !== "object" || Array.isArray(sources)) return false;
  for (const entry of Object.values(sources as Record<string, unknown>)) {
    if (entry == null) continue;
    if (typeof entry !== "object" || Array.isArray(entry)) return false;
    const { recent, daily } = entry as { recent?: unknown; daily?: unknown };
    if (!Array.isArray(recent) || !Array.isArray(daily)) return false;
  }
  return true;
}

export async function readStore(ctx: AppContext): Promise<HistoryStore> {
  if (!ctx.kv) return memoryStore;
  let raw: string | null;
  try {
    raw = await ctx.kv.get(HISTORY_KEY);
  } catch {
    return memoryStore;
  }
  if (!raw) return { sources: {} };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isValidStoreShape(parsed)) throw new Error("invalid shape");
    return parsed;
  } catch {
    // Corrupted history (truncated write or bad shape): self-heal instead of 500.
    // Delete async — a failed delete must not break the read path.
    ctx.kv.delete(HISTORY_KEY).catch(() => {});
    return { sources: {} };
  }
}

function newestSampleTime(store: HistoryStore): number {
  let newest = 0;
  for (const entry of Object.values(store.sources)) {
    const last = entry?.recent[entry.recent.length - 1];
    if (last && last.t > newest) newest = last.t;
  }
  return newest;
}

export async function recordStatusSamples(ctx: AppContext, now = Date.now()): Promise<void> {
  if (!(await acquireSampleLock(ctx))) return;
  try {
    const probed = await probeTargets(ctx);
    await mergeSamplesIntoStore(ctx, aggregateProbes(probed), now);
  } finally {
    await releaseSampleLock(ctx);
  }
}

export async function mergeSamplesIntoStore(
  ctx: AppContext,
  aggregates: Map<SourceId, SourceAggregate>,
  now = Date.now(),
): Promise<HistoryStore> {
  const store = await readStore(ctx);
  for (const [id, agg] of aggregates) {
    store.sources[id] = mergeSample(
      store.sources[id],
      { t: now, ok: agg.ok, latencyMs: agg.latencyMs, status: agg.status, error: agg.error },
      now,
    );
  }
  if (!ctx.kv) {
    memoryStore = store;
    return store;
  }
  try {
    await ctx.kv.put(HISTORY_KEY, JSON.stringify(store));
  } catch (err) {
    // KV write failure must not break reads; keep serving stale/memory.
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
  if (newestSampleTime(store) < Date.now() - SAMPLE_INTERVAL_MS) {
    try {
      await recordStatusSamples(ctx);
      store = await readStore(ctx);
    } catch {
      // Sampling failure: fall through with stale store.
    }
  }
  return store;
}

export async function getStatusHistory(ctx: AppContext) {
  const store = await ensureFreshSamples(ctx);
  const uptime = await getUptime(ctx);
  return buildHistoryPayload(store, uptime, Date.now());
}

export function statusFromStore(store: HistoryStore, now = Date.now()): { sources: SourceStatus[]; checkedAt: string } {
  const ids: SourceId[] = [...SOURCE_IDS];
  let newest = 0;
  const sources = ids.map((id): SourceStatus => {
    const entry = store.sources[id];
    const last = entry?.recent[entry.recent.length - 1];
    if (last) newest = Math.max(newest, last.t);
    return last
      ? {
          id,
          ok: last.ok,
          status: last.status ?? null,
          latencyMs: last.latencyMs,
          error: last.ok ? null : (last.error ?? "probe failed"),
          checkedAt: new Date(last.t).toISOString(),
        }
      : {
          id,
          ok: false,
          status: null,
          latencyMs: null,
          error: "no samples yet",
          checkedAt: new Date(now).toISOString(),
        };
  });
  return { sources, checkedAt: new Date(newest || now).toISOString() };
}
