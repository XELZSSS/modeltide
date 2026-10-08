import { onUnmounted, type Ref } from "vue";
import { historyIndex, isPopstateNavigation } from "@/client/router";

const SCROLL_RESTORE_WINDOW_MS = 5_000;

export function createScrollStore(): {
  record: (main: HTMLElement | null) => void;
  restore: (main: HTMLElement | null) => () => void;
} {
  const scrollOffsets = new Map<number, number>();
  let stopRestore: (() => void) | null = null;

  function record(main: HTMLElement | null): void {
    if (!main) return;
    scrollOffsets.set(historyIndex(), main.scrollTop);
  }

  function restore(main: HTMLElement | null): () => void {
    if (!main) return () => {};
    stopRestore?.();
    stopRestore = null;
    const idx = historyIndex();
    if (!isPopstateNavigation()) {
      for (const key of scrollOffsets.keys()) if (key >= idx) scrollOffsets.delete(key);
      main.scrollTo({ top: 0 });
      return () => {};
    }
    const target = scrollOffsets.get(idx) ?? 0;
    if (target === 0 || main.scrollHeight - main.clientHeight >= target) {
      main.scrollTo({ top: target });
      return () => {};
    }
    const initial = main.scrollTop;
    let cancelled = false;
    const stop = (): void => {
      cancelled = true;
      clearTimeout(deadline);
      observer.disconnect();
      main.removeEventListener("scroll", onUserScroll);
    };
    const apply = (): void => {
      if (cancelled || main.scrollHeight - main.clientHeight < target) return;
      stop();
      main.scrollTo({ top: target });
    };
    const onUserScroll = (): void => {
      if (main.scrollTop !== initial) stop();
    };
    const observer = new MutationObserver(apply);
    const deadline = setTimeout(stop, SCROLL_RESTORE_WINDOW_MS);
    observer.observe(main, { childList: true, subtree: true });
    main.addEventListener("scroll", onUserScroll, { passive: true });
    stopRestore = stop;
    return stop;
  }

  onUnmounted(() => {
    stopRestore?.();
  });

  return { record, restore };
}

export function useScrollRestoreMain(mainRef: Ref<HTMLElement | null>): {
  recordScroll: () => void;
  restoreScroll: () => void;
} {
  const store = createScrollStore();
  return {
    recordScroll: () => store.record(mainRef.value),
    restoreScroll: () => {
      store.restore(mainRef.value);
    },
  };
}
