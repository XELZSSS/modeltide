import { defineComponent, h, type Component } from "vue";

type LazyModule = { default: Component };

export function loadableView(load: () => Promise<LazyModule>): Component {
  let resolved: Component | null = null;
  let pending: Promise<void> | null = null;

  const loadOnce = (): Promise<void> => {
    pending ??= load()
      .then((module) => {
        resolved = module.default;
      })
      .catch((err: unknown) => {
        // Drop the rejected promise so an ErrorBoundary retry remounts and refetches.
        pending = null;
        throw err;
      });
    return pending;
  };

  return defineComponent({
    name: "LoadableView",
    inheritAttrs: false,
    async setup(_props, { attrs, slots }) {
      if (!resolved) await loadOnce();
      const view = resolved as Component;
      return () => h(view, attrs, slots);
    },
  });
}

/**
 * Kick a lazily loaded view's chunk request in the background, ignoring
 * failures (a failed preload is simply retried by the actual navigation).
 */
export function preloadChunk(load: (() => Promise<unknown>) | undefined): void {
  if (load) void load().then(undefined, () => {});
}
