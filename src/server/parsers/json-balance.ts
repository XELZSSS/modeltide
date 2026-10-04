export interface ScanSpend {
  chars: number;
}

export function balancedJsonEnd(
  text: string,
  openIdx: number,
  budget: number,
  spend?: ScanSpend,
): number {
  if (budget <= 0 || openIdx < 0 || openIdx >= text.length) return -1;
  const open = text.charCodeAt(openIdx);
  if (open !== 0x5b && open !== 0x7b) return -1;
  const maxEnd = Math.min(text.length, openIdx + budget);
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = openIdx; i < maxEnd; i++) {
    const c = text.charCodeAt(i);
    if (inStr) {
      if (esc) esc = false;
      else if (c === 0x5c) esc = true;
      else if (c === 0x22) inStr = false;
      continue;
    }
    if (c === 0x22) {
      inStr = true;
      continue;
    }
    if (c === 0x5b || c === 0x7b) {
      depth++;
    } else if (c === 0x5d || c === 0x7d) {
      depth--;
      if (depth === 0) {
        if (spend) spend.chars += i + 1 - openIdx;
        return i + 1;
      }
    }
  }
  if (spend) spend.chars += maxEnd - openIdx;
  return -1;
}

export function balancedJsonSlice(
  text: string,
  openAt: number,
  budgetChars: number,
  spend?: ScanSpend,
): string | null {
  const end = balancedJsonEnd(text, openAt, budgetChars, spend);
  return end === -1 ? null : text.slice(openAt, end);
}
