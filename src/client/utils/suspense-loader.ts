import { computed, effectScope, onScopeDispose, type VNodeChild } from "vue";

export function createSuspenseLoader<T>(
  load: () => Promise<T>,
  derive: (loaded: T) => Record<string, unknown>,
  render: (derived: Record<string, unknown>, slots: Record<string, (() => VNodeChild) | undefined>) => VNodeChild,
): (props: Record<string, never>, ctx: { slots: Record<string, (() => VNodeChild) | undefined> }) => VNodeChild {
  return (_props, ctx) => {
    const scope = effectScope();
    const loaded = scope.run(load) as unknown as Promise<T>;
    onScopeDispose(() => scope.stop());
    const derived = computed(() => derive((loaded as unknown as { value: T }).value ?? (loaded as unknown as T)));
    return render(derived.value, ctx.slots);
  };
}

export function useSuspenseScope<T>(load: () => Promise<T>): { scope: ReturnType<typeof effectScope>; loaded: T } {
  const scope = effectScope();
  const loaded = scope.run(load) as unknown as T;
  onScopeDispose(() => scope.stop());
  return { scope, loaded };
}
