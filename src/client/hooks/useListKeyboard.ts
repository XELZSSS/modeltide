import { useCallback, useEffect, useRef, useState } from "react";

export function useListKeyboard(itemCount: number, onSelect: (index: number) => void, onClose?: () => void) {
  const [activeIndex, setActiveIndex] = useState(-1);
  // Latest callbacks without forcing handleKeyDown identity churn on every render.
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => setActiveIndex(-1), [itemCount]);

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
      } else if (e.key === "Enter") {
        // Read the index functionally so Enter doesn't pin handleKeyDown identity
        // to the current clampedIndex (which rebuilt the callback on every arrow key).
        e.preventDefault();
        setActiveIndex((i) => {
          const clamped = i < 0 ? -1 : Math.min(i, itemCount - 1);
          if (clamped >= 0) selectRef.current(clamped);
          return -1;
        });
      } else if (e.key === "Escape") {
        setActiveIndex(-1);
        closeRef.current?.();
      }
    },
    [itemCount],
  );

  const clampedIndex = activeIndex < 0 ? -1 : Math.min(activeIndex, itemCount - 1);

  return { clampedIndex, setActiveIndex, handleKeyDown };
}
