import { useState } from "react";

export function useResetOnChange(key: string | number): boolean {
  const [prev, setPrev] = useState(key);
  if (prev !== key) {
    setPrev(key);
    return true;
  }
  return false;
}
