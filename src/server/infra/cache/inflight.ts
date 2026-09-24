const STORE_LEDGER_MAX_KEYS = 1024;

export class InflightRegistry {
  private map = new Map<string, Promise<unknown>>();
  private nextSeq = 0;
  private lastStored = new Map<string, number>();
  get<T>(vk: string): Promise<T> | undefined {
    return this.map.get(vk) as Promise<T> | undefined;
  }
  run<T>(vk: string, p: Promise<T>): Promise<T> {
    this.map.set(vk, p);
    return p;
  }
  release(vk: string, p: Promise<unknown>): void {
    if (this.map.get(vk) === p) this.map.delete(vk);
  }
  begin(): number {
    this.nextSeq += 1;
    return this.nextSeq;
  }
  canStore(vk: string, seq: number): boolean {
    return (this.lastStored.get(vk) ?? 0) < seq;
  }
  recordStore(vk: string, seq: number): void {
    this.lastStored.delete(vk);
    this.lastStored.set(vk, seq);
    if (this.lastStored.size <= STORE_LEDGER_MAX_KEYS) return;
    const oldest = this.lastStored.keys().next();
    if (!oldest.done) this.lastStored.delete(oldest.value);
  }
  clear(): void {
    this.map.clear();
    this.lastStored.clear();
    this.nextSeq = 0;
  }
}

export const sharedInflight = new InflightRegistry();
