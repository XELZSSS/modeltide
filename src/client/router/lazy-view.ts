import { defineComponent, h, type Component } from "vue";

type LazyModule = { default: Component };

const failing = new Set<() => void>();

export function resetLoadableViews(): void {
  for (const reset of failing) reset();
}

export function loadableView(load: () => Promise<LazyModule>): Component {
  let resolved: Component | null = null;
  let pending: Promise<void> | null = null;
  let failure: unknown = null;

  const loadOnce = (): Promise<void> => {
    pending ??= load()
      .then((module) => {
        resolved = module.default;
      })
      .catch((err: unknown) => {
        failure = err;
        failing.add(reset);
        throw err;
      });
    return pending;
  };

  const reset = (): void => {
    pending = null;
    failure = null;
    failing.delete(reset);
  };

  return defineComponent({
    name: "LoadableView",
    inheritAttrs: false,
    async setup(_props, { attrs, slots }) {
      if (failure !== null) throw failure;
      if (!resolved) await loadOnce();
      const view = resolved as Component;
      return () => h(view, attrs, slots);
    },
  });
}
