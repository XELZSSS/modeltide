import { CACHE_ENTRY_KV_TTL_S } from "./config";
import { decodeStored, jitteredTtl, kvMetadata, type DecodedEnvelope } from "./envelope";
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

/** The two-tier store: writes the L1 mirror and the versioned KV entry for one cache generation. */
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
    return sharedReads.runShared(vk, () => this.readVersioned<T>(kv, vk));
  }

  private async readVersioned<T>(kv: KvStore, vk: string): Promise<DecodedEnvelope<T> | undefined> {
    let read: { value: string | null; metadata: unknown };
    noteCacheStat("kvReads");
    try {
      read = await kv.getWithMetadata(vk);
    } catch (err) {
      noteCacheStat("kvReadFailures");
      warnKvReadFailure(this.log, err);
      return undefined;
    }
    if (!read.value) return undefined;
    return decodeStored<T>(read.value, read.metadata, vk, this.log);
  }

  /**
   * Stores one entry in both tiers. The body is encoded once here — the same string becomes the KV value, and for a
   * source a route returns, the L1 response copy the router serves. An internal source keeps no response copy: its
   * payload is only read as an object by another source, so its body exists solely to be the KV value.
   */
  async storeCurrent<T>(
    kv: KvStore | undefined,
    vk: string,
    data: T,
    ttl: number,
    serveBody = true,
  ): Promise<string | undefined> {
    const effective = jitteredTtl(vk, ttl);
    let body: string | undefined;
    try {
      body = JSON.stringify(data);
    } catch (err) {
      this.log("warn", `[cache] serialize failed for ${vk}: ${errMsg(err)}`);
    }
    if (body === undefined) return undefined;
    const expiresAt = Date.now() + effective;
    // The L1 lifetime must not depend on whether KV is bound: without KV an entry kept its full TTL (up to 6 h) in the
    // same isolate instead of being re-read. Cap it, and keep the jittered TTL as the stale budget.
    const retained = serveBody ? body : undefined;
    const cached = this.l1.set(vk, data, l1TtlFor(effective), utf8ByteLength(body), effective, retained);
    if (!cached) this.log("warn", `[cache] L1 skipped oversized entry for ${vk}`);
    if (!kv) return retained;
    const put = this.putEntry(kv, vk, body, expiresAt, effective).catch((err: unknown) => {
      this.log("warn", `[cache] KV write failed for ${vk}: ${errMsg(err)}`);
    });
    if (this.onDetach) {
      // The write is already in flight, so a throwing hook must not turn a stored refresh into a failure: the caller
      // would fall back to the stale copy this run just replaced, and `RefreshRunner` would record a 45 s cooldown.
      // `service.ts` and `util/abort.ts` guard their detach hooks the same way.
      try {
        this.onDetach(put);
      } catch (err) {
        this.log("warn", `[cache] onDetach callback failed: ${errMsg(err)}`);
      }
    } else await put;
    return retained;
  }

  private async putEntry(kv: KvStore, k: string, body: string, expiresAt: number, ttl: number): Promise<void> {
    const expirationTtl = Math.min(Math.max(Math.ceil((ttl + maxStaleMs(ttl)) / 1000), 60), CACHE_ENTRY_KV_TTL_S);
    noteCacheStat("kvWrites");
    await kv.put(k, body, { expirationTtl, metadata: kvMetadata(expiresAt, ttl) });
  }
}
