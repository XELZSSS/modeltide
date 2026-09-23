import { MAX_KV_RETENTION_TTL_S } from "@/server/config";
import { logger, type Logger } from "@/server/infra/logger";
import { utf8ByteLength } from "@/server/infra/hash";
import type { KvStore } from "./kv";
import { decodeEnvelope, encodeEnvelope, jitteredTtl, maxStaleMs, type StaleEnvelope } from "./envelope";
import { l1TtlFor, type MemoryL1 } from "./memory-l1";

function warnKvReadFailure(log: Logger, err: unknown): void {
  log(
    "warn",
    `[cache] KV read failed, degrading to refresh/stale path: ${err instanceof Error ? err.message : String(err)}`,
  );
}

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

  async getVersioned<T>(kv: KvStore, k: string): Promise<{ env: StaleEnvelope<T>; bytes: number } | undefined> {
    let raw: string | null;
    try {
      raw = await kv.get(this.vk(k));
    } catch (err) {
      warnKvReadFailure(this.log, err);
      return undefined;
    }
    if (!raw) return undefined;
    return decodeEnvelope<T>(raw);
  }

  async storeCurrent<T>(kv: KvStore | undefined, vk: string, data: T, ttl: number): Promise<void> {
    const effective = jitteredTtl(vk, ttl);
    let serialized: string;
    try {
      serialized = encodeEnvelope(data, effective);
    } catch (err) {
      this.log("warn", `[cache] serialize failed for ${vk}: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    // Only the KV put can be handed off (the cron has no detach hook); without KV the L1 wins.
    this.l1.set(vk, data, kv ? l1TtlFor(effective) : effective, utf8ByteLength(serialized), effective);
    if (!kv) return;
    const put = this.setSerialized(kv, vk, serialized, effective).catch((err: unknown) => {
      this.log("warn", `[cache] KV write failed for ${vk}: ${err instanceof Error ? err.message : String(err)}`);
    });
    if (this.onDetach) this.onDetach(put);
    else await put;
  }

  private async setSerialized(kv: KvStore, k: string, serialized: string, ttl: number): Promise<void> {
    const expirationTtl = Math.min(Math.max(Math.ceil((ttl + maxStaleMs(ttl)) / 1000), 60), MAX_KV_RETENTION_TTL_S);
    await kv.put(k, serialized, { expirationTtl });
  }
}
