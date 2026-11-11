/**
 * `JSON.parse` with a miss sentinel: JSON never parses to `undefined`, so that value is the one unambiguous result a
 * caller can test against — `null` is a document.
 */
export function tryJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
