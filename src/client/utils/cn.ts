import { extendTailwindMerge, type ClassNameValue } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: { classGroups: { tracking: [{ tracking: ["text", "title", "display"] }] } },
});

/**
 * `tailwind-merge` already joins the strings, arrays and falsy values this project passes it, so the merge is the whole
 * implementation. The one shape `twMerge` does not take is an object map (`{ "a": isOn }`), and nothing here passes one.
 */
export function cn(...inputs: ClassNameValue[]): string {
  return twMerge(inputs);
}
