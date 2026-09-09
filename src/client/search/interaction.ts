"use client";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export function useClickOutside(ref: RefObject<HTMLElement | null>, onOutside: () => void) {
  const onOutsideRef = useRef(onOutside);
  onOutsideRef.current = onOutside;

  useEffect(() => {
    function handle(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutsideRef.current();
    }
    function handleFocus(e: FocusEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutsideRef.current();
    }
    document.addEventListener("pointerdown", handle);
    document.addEventListener("focusin", handleFocus);
    return () => {
      document.removeEventListener("pointerdown", handle);
      document.removeEventListener("focusin", handleFocus);
    };
  }, [ref]);
}

export function useListKeyboard(itemCount: number, onSelect: (index: number) => void, onClose?: () => void) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const activeRef = useRef(activeIndex);
  activeRef.current = activeIndex;

  useEffect(() => setActiveIndex(-1), [itemCount]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveIndex(-1);
        closeRef.current?.();
        return;
      }
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
        e.preventDefault();
        const clamped = activeRef.current < 0 ? -1 : Math.min(activeRef.current, itemCount - 1);
        if (clamped >= 0) selectRef.current(clamped);
        setActiveIndex(-1);
      }
    },
    [itemCount],
  );

  const clampedIndex = activeIndex < 0 ? -1 : Math.min(activeIndex, itemCount - 1);

  return { clampedIndex, setActiveIndex, handleKeyDown };
}
