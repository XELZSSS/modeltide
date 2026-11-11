import { computed, type ComputedRef } from "vue";
import { useSoftNotFound } from "@/client/router/document-meta";

interface ModelLookup<T> {
  /** The row the route points at, or `null` when this payload does not carry it. */
  model: ComputedRef<T | null>;
  /** Whether the payload that was looked into is a degraded copy of the index. */
  partial: ComputedRef<boolean>;
  /** Whether the route resolved to nothing this payload can render — i.e. a real soft 404. */
  miss: ComputedRef<boolean>;
}

/** The lookup every model detail page performs, and the one decision that must not drift between them: only a complete
 * payload may turn the title and the robots tag into "not found". A missing row inside a `partial` payload is not the
 * reader's 404 and must not be published to crawlers as one — `ModelMiss` says so in the body instead. */
export function useModelLookup<T>(model: () => T | undefined | null, partial: () => boolean): ModelLookup<T> {
  const found = computed(() => model() ?? null);
  const degraded = computed(partial);
  const miss = computed(() => found.value === null && !degraded.value);
  useSoftNotFound(miss);
  return { model: found, partial: degraded, miss };
}
