"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export function useDebouncedTerm(initial: string, delayMs = 200): {
  inputValue: string;
  setInputValue: (v: string) => void;
  debounced: string;
  setDebouncedDirect: (v: string) => void;
  cancel: () => void;
} {
  const [inputValue, setInputValue] = useState(initial);
  const [debounced, setDebounced] = useState(initial);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  useEffect(() => () => cancel(), [cancel]);
  useEffect(() => {
    if (inputValue === debounced) return;
    cancel();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setDebounced(inputValue);
    }, delayMs);
  }, [inputValue, debounced, delayMs, cancel]);
  const setDebouncedDirect = useCallback(
    (v: string) => {
      cancel();
      setDebounced(v);
      setInputValue(v);
    },
    [cancel],
  );
  return { inputValue, setInputValue, debounced, setDebouncedDirect, cancel };
}
