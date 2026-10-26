import { watch } from "vue";
import { assertPayloadShape } from "@/client/api/decode/payload";

/**
 * Raises a malformed payload to the nearest `ErrorBoundary` instead of letting the view render an empty list over a
 * broken response — the same guard every view that reads a wire payload needs, written once.
 *
 * `immediate` and the default (pre) flush are load-bearing: the first render's `malformed` payload has to throw during
 * setup, while `suspense-query.vue`'s boundary is the one rendering the view, or the failure surfaces a tick later as an
 * unhandled error with the broken view already on screen.
 */
export function useMalformedGuard(malformed: () => boolean, label: string | (() => string)): void {
  const labelOf = typeof label === "string" ? () => label : label;
  watch(malformed, (value) => assertPayloadShape(value, labelOf()), { immediate: true });
}
