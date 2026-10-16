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

/**
 * Roving-focus keydown shared by tab containers and segmented controls:
 * resolves the next item and calls `preventDefault()` for handled keys.
 * Callers emit their own change event and focus `element-${returnedId}`
 * afterwards, in that order.
 */
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
