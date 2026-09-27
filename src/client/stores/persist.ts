export function safeStorage(kind: "local" | "session"): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readPersisted<T>(storage: Storage | null, key: string, version: number): Partial<T> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { state?: unknown; version?: unknown } | null;
    if (parsed == null || typeof parsed !== "object" || parsed.version !== version) return {};
    const state = parsed.state;
    return state != null && typeof state === "object" ? (state as Partial<T>) : {};
  } catch (err) {
    console.warn(`[storage] ignoring malformed "${key}": ${err instanceof Error ? err.message : String(err)}`);
    return {};
  }
}

export function writePersisted<T>(storage: Storage | null, key: string, version: number, state: T): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify({ state, version }));
  } catch (err) {
    console.warn(`[storage] persist failed for "${key}": ${err instanceof Error ? err.message : String(err)}`);
  }
}
