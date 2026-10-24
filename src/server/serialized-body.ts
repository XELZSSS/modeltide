/**
 * The serialized response body travels with the payload object it belongs to. The cache computes it once, when it
 * stores the entry, and the router reads it back instead of re-encoding the same object on every response.
 *
 * A symbol keeps it invisible to `JSON.stringify` (the wire contract stays exactly `SourcePayload`) and to any spread
 * copy, so a degraded payload without a body simply falls back to encoding itself.
 */
const SERIALIZED_BODY = Symbol("modeltide.serializedBody");

type WithSerializedBody = { [SERIALIZED_BODY]?: string };

export function attachSerializedBody<T extends object>(payload: T, body: string): T {
  Object.defineProperty(payload, SERIALIZED_BODY, { value: body, configurable: true });
  return payload;
}

export function serializedBodyOf(payload: object): string | undefined {
  return (payload as WithSerializedBody)[SERIALIZED_BODY];
}
