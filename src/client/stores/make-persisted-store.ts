import { initStorageSync, readPersisted, safeStorage } from "@/client/stores/persist";

type StorageKind = "local" | "session";

export function loadPersistedState<T>(kind: StorageKind, key: string, version: number): Partial<T> {
  return readPersisted<T>(safeStorage(kind), key, version);
}

interface PersistedSyncDef<TStore extends { $subscribe: (...args: never[]) => unknown }, TSnapshot> {
  useStore: () => TStore;
  kind: StorageKind;
  key: string;
  version: number;
  snapshot: (store: TStore) => TSnapshot;
  onStorageEvent?: (store: TStore, parsed: unknown) => void;
}

export function makeStorageSync<TStore extends { $subscribe: (...args: never[]) => unknown }, TSnapshot>(
  def: PersistedSyncDef<TStore, TSnapshot>,
): () => void {
  return () => {
    initStorageSync(
      def.useStore() as never,
      {
        storage: safeStorage(def.kind),
        key: def.key,
        version: def.version,
        snapshot: def.snapshot as never,
        onStorageEvent: def.onStorageEvent as never,
      } as never,
    );
  };
}
