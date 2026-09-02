export class CacheService {
  private inflight = new Map<string, Promise<unknown>>();
  constructor(
    private kv: KVNamespace | undefined,
    private version: string,
  ) {}

  private vk(k: string): string {
    return `${this.version}:${k}`;
  }

  private async get<T>(k: string): Promise<T | undefined> {
    if (!this.kv) return undefined;
    const raw = await this.kv.get(k, { type: "text", cacheTtl: 30 });
    if (!raw) return undefined;
    return JSON.parse(raw) as T;
  }

  private async set<T>(k: string, v: T, ttl: number): Promise<void> {
    if (!this.kv) return;
    await this.kv.put(k, JSON.stringify(v), { expirationTtl: Math.ceil(ttl / 1000) });
  }

  async setSafe<T>(k: string, v: T, ttl: number): Promise<void> {
    if (!this.kv) return;
    await this.set(this.vk(k), v, ttl);
  }

  async withTtl<T>(k: string, ttl: number, fn: () => Promise<{ data: T; ttl?: number }>): Promise<T> {
    // No KV: bypass cache and fetch upstream directly (graceful degradation per docs)
    // Docs: https://developers.cloudflare.com/kv/concepts/kv-bindings/ — binding is optional, env.CACHE is undefined when not configured
    if (!this.kv) {
      const { data } = await fn();
      return data;
    }
    const vk = this.vk(k);
    const hit = await this.get<T>(vk);
    if (hit !== undefined) return hit;
    const existing = this.inflight.get(vk) as Promise<T> | undefined;
    if (existing) return existing;
    const p = (async () => {
      const { data, ttl: t } = await fn();
      await this.set(vk, data, t ?? ttl);
      return data;
    })();
    this.inflight.set(vk, p);
    try {
      return await p;
    } finally {
      this.inflight.delete(vk);
    }
  }

  /** Whether KV caching is enabled */
  get enabled(): boolean {
    return !!this.kv;
  }
}
