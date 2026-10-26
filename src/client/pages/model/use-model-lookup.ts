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

/**
 * The lookup every model detail page performs, and the one decision that must not drift between them.
 *
 * A `partial` payload can be missing the row of a model that exists — a capped source, a failed leg, a stale copy — so
 * only a complete payload may turn the title and the robots tag into "not found". The body may still say
 * "not found" for that row (that is what `ModelMiss` decides with the same `partial` flag), but a missing row inside a
 * degraded payload is not the reader's 404 and must not be published to crawlers as one.
 */
export function useModelLookup<T>(model: () => T | undefined | null, partial: () => boolean): ModelLookup<T> {
  const found = computed(() => model() ?? null);
  const degraded = computed(partial);
  const miss = computed(() => found.value === null && !degraded.value);
  useSoftNotFound(miss);
  return { model: found, partial: degraded, miss };
}
