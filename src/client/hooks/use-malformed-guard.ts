import { watch } from "vue";
import { assertPayloadShape } from "@/client/api/decode/payload";

/** Raises a malformed payload to the nearest `ErrorBoundary` instead of letting the view render an empty list over a
 * broken response. `immediate` and the default (pre) flush are load-bearing: the first render's `malformed` payload has
 * to throw during setup, while `suspense-query.vue`'s boundary is the one rendering the view. */
export function useMalformedGuard(malformed: () => boolean, label: string | (() => string)): void {
  const labelOf = typeof label === "string" ? () => label : label;
  watch(malformed, (value) => assertPayloadShape(value, labelOf()), { immediate: true });
}
