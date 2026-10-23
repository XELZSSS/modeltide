import { CACHE_ENTRY_KV_TTL_S } from "./config";
import { decodeEnvelope, encodeEnvelope, jitteredTtl, type DecodedEnvelope } from "./envelope";
import { sharedReads } from "./inflight";
import { l1TtlFor, type MemoryL1 } from "./l1";
import { maxStaleMs } from "./stale";
import { noteCacheStat } from "./stats";
import { kvReadWarnGate } from "@/server/util/throttle";
import { logger, type Logger } from "@/server/api/logger";
import { errMsg } from "@/server/api/errors";
import { utf8ByteLength } from "@/server/util/hash";
import type { KvStore } from "./kv";

function warnKvReadFailure(log: Logger, err: unknown): void {
  if (!kvReadWarnGate.open()) return;
  log("warn", `[cache] KV read failed, degrading to refresh/stale path: ${errMsg(err)}`);
}

/** The two-tier store: writes the L1 mirror and the versioned KV envelope for one cache generation. */
export class TierStore {
  private log: Logger;

  constructor(
    private version: string,
    private l1: MemoryL1,
    private onDetach?: (work: Promise<unknown>) => void,
    log?: Logger,
  ) {
    this.log = log ?? logger;
  }

  vk(k: string): string {
    return `${this.version}:${k}`;
  }

  async getVersioned<T>(kv: KvStore, k: string): Promise<DecodedEnvelope<T> | undefined> {
    const vk = this.vk(k);
    return sharedReads.run(vk, () => this.readVersioned<T>(kv, vk));
  }

  private async readVersioned<T>(kv: KvStore, vk: string): Promise<DecodedEnvelope<T> | undefined> {
    let raw: string | null;
    noteCacheStat("kvReads");
    try {
      raw = await kv.get(vk);
    } catch (err) {
      noteCacheStat("kvReadFailures");
      warnKvReadFailure(this.log, err);
      return undefined;
    }
    if (!raw) return undefined;
    return decodeEnvelope<T>(raw, vk, this.log);
  }

  async storeCurrent<T>(kv: KvStore | undefined, vk: string, data: T, ttl: number): Promise<void> {
    const effective = jitteredTtl(vk, ttl);
    let serialized: string | undefined;
    try {
      serialized = encodeEnvelope(data, effective);
    } catch (err) {
      this.log("warn", `[cache] serialize failed for ${vk}: ${errMsg(err)}`);
    }
    if (serialized === undefined) return;
    // The L1 lifetime must not depend on whether KV is bound: without KV an entry kept its full TTL (up to
    // 6 h) in the same isolate instead of being re-read. Cap it, and keep the jittered TTL as the stale budget.
    const cached = this.l1.set(vk, data, l1TtlFor(effective), utf8ByteLength(serialized), effective);
    if (!cached) this.log("warn", `[cache] L1 skipped oversized entry for ${vk}`);
    if (!kv) return;
    const put = this.setSerialized(kv, vk, serialized, effective).catch((err: unknown) => {
      this.log("warn", `[cache] KV write failed for ${vk}: ${errMsg(err)}`);
    });
    if (this.onDetach) this.onDetach(put);
    else await put;
  }

  private async setSerialized(kv: KvStore, k: string, serialized: string, ttl: number): Promise<void> {
    const expirationTtl = Math.min(Math.max(Math.ceil((ttl + maxStaleMs(ttl)) / 1000), 60), CACHE_ENTRY_KV_TTL_S);
    noteCacheStat("kvWrites");
    await kv.put(k, serialized, { expirationTtl });
  }
}
