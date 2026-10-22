import { errMsg } from "@/shared/utils";

type StorageKind = "local" | "session";

function safeStorage(kind: StorageKind): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function readPersisted<T>(storage: Storage | null, key: string, version: number): Partial<T> {
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

function writePersisted<T>(storage: Storage | null, key: string, version: number, state: T): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify({ state, version }));
  } catch (err) {
    console.warn(`[storage] persist failed for "${key}": ${errMsg(err)}`);
  }
}

const pendingFlushes = new Map<string, () => void>();

function scheduleFlush(key: string, write: () => void): void {
  if (pendingFlushes.has(key)) {
    pendingFlushes.set(key, write);
    return;
  }
  pendingFlushes.set(key, write);
  queueMicrotask(() => {
    const latest = pendingFlushes.get(key);
    pendingFlushes.delete(key);
    latest?.();
  });
}

function flushPersistedWrites(): void {
  while (pendingFlushes.size > 0) {
    const entries = [...pendingFlushes.entries()];
    pendingFlushes.clear();
    for (const [, write] of entries) write();
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushPersistedWrites);
}

export function loadPersistedState<T>(kind: StorageKind, key: string, version: number): Partial<T> {
  return readPersisted(safeStorage(kind), key, version);
}

interface Subscribable {
  $subscribe(callback: (mutation: unknown, state: unknown) => void, options?: { detached?: boolean }): () => void;
}

const syncedKeys = new Set<string>();

export function makeStorageSync<TStore extends Subscribable, TSnapshot>(def: {
  useStore: () => TStore;
  kind: StorageKind;
  key: string;
  version: number;
  snapshot: (store: TStore) => TSnapshot;
  onStorageEvent?: (store: TStore, parsed: unknown) => void;
}): () => void {
  return () => {
    const store = def.useStore();
    const key = def.key;
    if (syncedKeys.has(key)) return;
    syncedKeys.add(key);
    const storage = safeStorage(def.kind);
    store.$subscribe(() => scheduleFlush(key, () => writePersisted(storage, key, def.version, def.snapshot(store))), {
      detached: true,
    });
    if (def.onStorageEvent == null) return;
    const onStorageEvent = def.onStorageEvent;
    window.addEventListener("storage", (event) => {
      if (event.key !== key || event.newValue == null) return;
      try {
        onStorageEvent(store, JSON.parse(event.newValue));
      } catch (err) {
        console.warn(`[storage] ignoring malformed "${key}" event: ${errMsg(err)}`);
      }
    });
  };
}
