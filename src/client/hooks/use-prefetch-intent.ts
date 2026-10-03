import { onUnmounted } from "vue";
import { preloadChunk, prefetchQueries, type PrefetchTarget } from "@/client/router/prefetch";

const HOVER_PREFETCH_DELAY_MS = 150;

const TOUCH_PREFETCH_DELAY_MS = 300;

export interface PrefetchIntent<Id> {
  hover: (id: Id) => void;
  touch: (id: Id) => void;
  cancel: () => void;
}

export function usePrefetchIntent<Id>(target: (id: Id) => PrefetchTarget): PrefetchIntent<Id> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = (): void => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };

  onUnmounted(cancel);

  return {
    hover: (id) => {
      cancel();
      timer = setTimeout(() => {
        timer = null;
        const { queries, load } = target(id);
        prefetchQueries(queries ?? []);
        preloadChunk(load);
      }, HOVER_PREFETCH_DELAY_MS);
    },
    touch: (id) => {
      const { queries, load } = target(id);
      preloadChunk(load);
      cancel();
      timer = setTimeout(() => {
        timer = null;
        prefetchQueries(queries ?? []);
      }, TOUCH_PREFETCH_DELAY_MS);
    },
    cancel,
  };
}
