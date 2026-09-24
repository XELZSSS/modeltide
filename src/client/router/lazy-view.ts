import { createElement, type ComponentType, type ReactNode } from "react";

type LazyModule<P> = { default: ComponentType<P> };

const resettable = new Set<() => void>();

export function resetLoadableViews(): void {
  for (const reset of resettable) reset();
}

export function loadableView<P extends object = Record<string, never>>(
  load: () => Promise<LazyModule<P>>,
): ComponentType<P> {
  let resolved: LazyModule<P> | null = null;
  let pending: Promise<LazyModule<P>> | null = null;
  let failure: unknown = null;

  const loadOnce = (): Promise<LazyModule<P>> => {
    if (!pending) {
      pending = load()
        .then((module) => {
          resolved = module;
          return module;
        })
        .catch((err: unknown) => {
          failure = err;
          throw err;
        });
    }
    return pending;
  };

  const view = function LoadableView(props: P): ReactNode {
    if (resolved) return createElement(resolved.default, props);
    if (failure !== null) throw failure;
    throw loadOnce();
  };

  resettable.add(() => {
    if (failure === null) return;
    pending = null;
    failure = null;
  });

  return view;
}
