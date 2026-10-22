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

export function preloadChunk(load: (() => Promise<unknown>) | undefined): void {
  if (load) void load().then(undefined, () => {});
}
