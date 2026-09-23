/** The subset of the Workers `KVNamespace` shape `KvStore` accepts. */
interface KvBinding {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

// The one place KV is touched: every operation throws, so each caller decides whether a failed
// read degrades, a failed write is swallowed, or a failed lock fails the round.
export class KvStore {
  constructor(private readonly binding: KvBinding | undefined) {}

  get available(): boolean {
    return this.binding !== undefined;
  }

  async get(key: string): Promise<string | null> {
    return (await this.bindingOf().get(key)) ?? null;
  }

  async put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
    await this.bindingOf().put(key, value, opts);
  }

  async delete(key: string): Promise<void> {
    await this.bindingOf().delete(key);
  }

  private bindingOf(): KvBinding {
    const { binding } = this;
    if (!binding) throw new Error("KV binding is not configured");
    return binding;
  }
}
