import { useState } from "react";

/**
 * Watch a key and report when it changes, so derived state can reset without
 * an extra render frame. The setState-during-render below is the sanctioned
 * React pattern for derived state (same render pass, no commit flash).
 */
export function useResetOnChange(key: string | number): boolean {
  const [prev, setPrev] = useState(key);
  if (prev !== key) {
    setPrev(key);
    return true;
  }
  return false;
}
