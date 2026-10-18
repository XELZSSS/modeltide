export interface TabItem {
  id: string;
  label: string;
}

export function nextIndexForKey(key: string, index: number, length: number): number | null {
  if (length === 0 || index < 0) return null;
  if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % length;
  if (key === "ArrowLeft" || key === "ArrowUp") return (index - 1 + length) % length;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  return null;
}

/** Resolves the next roving item and calls `preventDefault()`; callers must then emit the change event. */
export function nextRovingId(
  event: KeyboardEvent,
  items: readonly { id: string }[],
  currentId: string | undefined,
): string | null {
  const nextIndex = nextIndexForKey(
    event.key,
    items.findIndex((item) => item.id === currentId),
    items.length,
  );
  if (nextIndex == null) return null;
  event.preventDefault();
  return items[nextIndex]?.id ?? null;
}

/** Wiring for a `role="radiogroup"` built from `role="radio"` buttons. */
export interface RovingRadioConfig<Id extends string> {
  items: () => readonly Id[];
  activeId: () => Id;
  elementId: (id: Id) => string;
  select: (id: Id) => void;
}

export interface RovingRadio<Id extends string> {
  tabIndexFor: (id: Id) => number;
  onKeydown: (event: KeyboardEvent) => void;
}

/**
 * Roving tabindex + arrow/Home/End selection for a `role="radiogroup"` of `role="radio"`s;
 * bind `onKeydown` on the group and `tabIndexFor(id)` on every option.
 */
export function useRovingRadio<Id extends string>(config: RovingRadioConfig<Id>): RovingRadio<Id> {
  function tabIndexFor(id: Id): number {
    return id === config.activeId() ? 0 : -1;
  }

  function onKeydown(event: KeyboardEvent): void {
    const ids = config.items();
    const nextId = nextRovingId(
      event,
      ids.map((id) => ({ id })),
      config.activeId(),
    );
    const next = ids.find((id) => id === nextId);
    if (next == null) return;
    config.select(next);
    document.getElementById(config.elementId(next))?.focus();
  }

  return { tabIndexFor, onKeydown };
}
