import { defineComponent, h, type Component } from "vue";

type LazyModule = { default: Component };

const resettable = new Set<() => void>();

export function resetLoadableViews(): void {
  for (const reset of resettable) reset();
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
        throw err;
      });
    return pending;
  };

  resettable.add(() => {
    if (failure === null) return;
    pending = null;
    failure = null;
  });

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
