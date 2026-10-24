import { extendTailwindMerge, type ClassNameValue } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: { classGroups: { tracking: [{ tracking: ["text", "title", "display"] }] } },
});

/**
 * `tailwind-merge` already joins the inputs this project passes it — strings, arrays, and the falsy values a
 * `condition && "class"` produces — so the merge is the whole implementation. `clsx` sat in front of it doing the same
 * join, which is why it is no longer a dependency. The one shape `twMerge` does not take is an object map
 * (`{ "a": isOn }`), and nothing here passes one.
 */
export function cn(...inputs: ClassNameValue[]): string {
  return twMerge(inputs);
}
