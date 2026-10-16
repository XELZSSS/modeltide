interface KvBinding {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

// Constructed only when the CACHE binding exists; callers route around it
// (memory-only fallback) otherwise.
export class KvStore {
  constructor(private readonly binding: KvBinding) {}

  async get(key: string): Promise<string | null> {
    return (await this.binding.get(key)) ?? null;
  }

  async put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
    await this.binding.put(key, value, opts);
  }

  async delete(key: string): Promise<void> {
    await this.binding.delete(key);
  }
}
