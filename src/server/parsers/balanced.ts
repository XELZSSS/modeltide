export function balancedJsonEnd(text: string, openIdx: number, budget: number): number {
  if (budget <= 0 || openIdx < 0 || openIdx >= text.length) return -1;
  const open = text.charAt(openIdx);
  if (open !== "[" && open !== "{") return -1;
  const maxEnd = Math.min(text.length, openIdx + budget);
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = openIdx; i < maxEnd; i++) {
    const c = text.charAt(i);
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "[" || c === "{") {
      depth++;
    } else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}
