"use client";
import { useCallback, useEffect, useRef } from "react";

/**
 * Debounce a callback: `flush(...args)` schedules `fn` after `delayMs` of
 * silence; `cancel()` drops any pending invocation. Cleanup on unmount.
 */
export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, delayMs: number) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  const flush = useCallback(
    (...args: A) => {
      cancel();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        fnRef.current(...args);
      }, delayMs);
    },
    [cancel, delayMs],
  );
  useEffect(() => cancel, [cancel]);
  return { flush, cancel };
}
