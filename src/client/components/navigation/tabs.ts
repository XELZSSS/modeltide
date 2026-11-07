/**
 * Roving focus for a strip of tabs or radios: the strip is a single tab stop, and Arrow/Home/End move the selection
 * inside it (which also moves focus, so the reader follows the selection visually and for a screen reader).
 */
export interface TabItem {
  id: string;
  label: string;
}

function nextIndexForKey(key: string, index: number, length: number): number | null {
  if (length === 0 || index < 0) return null;
  if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % length;
  if (key === "ArrowLeft" || key === "ArrowUp") return (index - 1 + length) % length;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  return null;
}

/** The id an arrow / Home / End keypress moves to, or `null` for a key the strip does not handle. */
function nextRovingId<Id extends string>(
  event: KeyboardEvent,
  ids: readonly Id[],
  currentId: Id | undefined,
): Id | null {
  const currentIndex = currentId === undefined ? -1 : ids.indexOf(currentId);
  const nextIndex = nextIndexForKey(event.key, currentIndex, ids.length);
  if (nextIndex === null) return null;
  event.preventDefault();
  return ids[nextIndex] ?? null;
}

interface RovingRadioConfig<Id extends string> {
  items: () => readonly Id[];
  activeId: () => Id;
  elementId: (id: Id) => string;
  select: (id: Id) => void;
}

interface RovingRadio<Id extends string> {
  tabIndexFor: (id: Id) => number;
  onKeydown: (event: KeyboardEvent) => void;
}

export function useRovingRadio<Id extends string>(config: RovingRadioConfig<Id>): RovingRadio<Id> {
  function tabIndexFor(id: Id): number {
    return id === config.activeId() ? 0 : -1;
  }

  function onKeydown(event: KeyboardEvent): void {
    const nextId = nextRovingId(event, config.items(), config.activeId());
    if (nextId === null) return;
    config.select(nextId);
    document.getElementById(config.elementId(nextId))?.focus();
  }

  return { tabIndexFor, onKeydown };
}
