interface KvBinding {
  getWithMetadata(key: string): Promise<{ value: string | null; metadata: unknown }>;
  put(key: string, value: string, options?: { expirationTtl?: number; metadata?: unknown }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface KvRead {
  value: string | null;
  metadata: unknown;
}

export class KvStore {
  constructor(private readonly binding: KvBinding) {}

  /**
   * One read returns both halves of an entry: the response body (kept verbatim) and the expiry metadata, which lives
   * outside the value so the value can be the body itself.
   */
  async getWithMetadata(key: string): Promise<KvRead> {
    const result = await this.binding.getWithMetadata(key);
    return { value: result.value ?? null, metadata: result.metadata };
  }

  async put(key: string, value: string, opts?: { expirationTtl?: number; metadata?: unknown }): Promise<void> {
    await this.binding.put(key, value, opts);
  }

  async delete(key: string): Promise<void> {
    await this.binding.delete(key);
  }
}
