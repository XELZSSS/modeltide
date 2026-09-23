import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** tailwind-merge only knows Tailwind's names; the `tracking` steps come from theme.css, so
 *  without this a later `tracking-normal` cannot cancel an earlier step. */
const twMerge = extendTailwindMerge({
  extend: { classGroups: { tracking: [{ tracking: ["text", "label", "caps", "title", "display"] }] } },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
