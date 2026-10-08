import { onScopeDispose, ref, type Ref } from "vue";

export function createSharedRef<T>(
  resolve: () => T,
  subscribe: (notify: () => void) => () => void,
): () => Ref<T> {
  let shared: T | null = null;
  let initialized = false;
  const listeners = new Set<(value: T) => void>();
  let unsubscribe: (() => void) | null = null;

  function current(): T {
    if (!initialized) {
      shared = resolve();
      initialized = true;
    }
    return shared as T;
  }

  function notify(): void {
    shared = resolve();
    for (const listener of listeners) listener(shared as T);
  }

  function ensureSubscribed(): void {
    if (!unsubscribe) unsubscribe = subscribe(notify);
  }

  return function useSharedRef(): Ref<T> {
    const value = ref(current()) as Ref<T>;
    ensureSubscribed();
    const listener = (next: T): void => {
      value.value = next;
    };
    listeners.add(listener);
    onScopeDispose(() => {
      listeners.delete(listener);
    });
    return value;
  };
}
