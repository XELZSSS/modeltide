interface KvBinding {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

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
