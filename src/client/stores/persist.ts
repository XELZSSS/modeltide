import { errMsg } from "@/shared/utils";

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
    if (parsed == null || typeof parsed !== "object") return {};
    if (parsed.version !== version) {
      console.warn(`[storage] dropping "${key}": stored version ${String(parsed.version)} != ${version}`);
      return {};
    }
    const state = parsed.state;
    return state != null && typeof state === "object" ? (state as Partial<T>) : {};
  } catch (err) {
    console.warn(`[storage] ignoring malformed "${key}": ${errMsg(err)}`);
    return {};
  }
}

export function writePersisted<T>(storage: Storage | null, key: string, version: number, state: T): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify({ state, version }));
  } catch (err) {
    console.warn(`[storage] persist failed for "${key}": ${errMsg(err)}`);
  }
}

interface Subscribable {
  $subscribe(callback: (mutation: unknown, state: unknown) => void, options?: { detached?: boolean }): () => void;
}

export interface StorageSyncOptions<TStore extends Subscribable, TPersisted> {
  storage: Storage | null;
  key: string;
  version: number;
  snapshot: (store: TStore) => TPersisted;
  onStorageEvent?: (store: TStore, parsed: unknown) => void;
}

const syncedKeys = new Set<string>();

export function resetStorageSyncForTest(): void {
  syncedKeys.clear();
}

export function initStorageSync<TStore extends Subscribable, TPersisted>(
  store: TStore,
  options: StorageSyncOptions<TStore, TPersisted>,
): void {
  const { storage, key, version, snapshot, onStorageEvent } = options;
  if (syncedKeys.has(key)) return;
  syncedKeys.add(key);
  store.$subscribe(() => writePersisted(storage, key, version, snapshot(store)), { detached: true });
  if (onStorageEvent == null) return;
  window.addEventListener("storage", (event) => {
    if (event.key !== key || event.newValue == null) return;
    try {
      onStorageEvent(store, JSON.parse(event.newValue));
    } catch (err) {
      console.warn(`[storage] ignoring malformed "${key}" event: ${errMsg(err)}`);
    }
  });
}
