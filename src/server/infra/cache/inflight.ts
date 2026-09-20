export class InflightRegistry {
  private map = new Map<string, Promise<unknown>>();
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
  clear(): void {
    this.map.clear();
  }
}

export const sharedInflight = new InflightRegistry();
