import { useState } from "react";

/** Reset derived state when a key changes; the setState-during-render is React's sanctioned pattern. */
export function useResetOnChange(key: string | number): boolean {
  const [prev, setPrev] = useState(key);
  if (prev !== key) {
    setPrev(key);
    return true;
  }
  return false;
}
