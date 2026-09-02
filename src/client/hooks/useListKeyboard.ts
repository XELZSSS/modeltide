import { useCallback, useEffect, useState } from "react";

export function useListKeyboard(itemCount: number, onSelect: (index: number) => void, onClose?: () => void) {
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => setActiveIndex(-1), [itemCount]);

  const clampedIndex = activeIndex < 0 ? -1 : Math.min(activeIndex, itemCount - 1);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (itemCount === 0) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") e.preventDefault();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % itemCount);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i <= 0 ? itemCount - 1 : i - 1));
      } else if (e.key === "Enter" && clampedIndex >= 0) {
        e.preventDefault();
        setActiveIndex(-1);
        onSelect(clampedIndex);
      } else if (e.key === "Escape") {
        setActiveIndex(-1);
        onClose?.();
      }
    },
    [itemCount, clampedIndex, onSelect, onClose],
  );

  return { clampedIndex, setActiveIndex, handleKeyDown };
}
