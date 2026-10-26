import { describe, expect, it, beforeEach } from "vitest";
import { resetModuleCachesForTests } from "@/server/cache/service";
import { parseDirectoryRows } from "./parse-directory";

beforeEach(() => resetModuleCachesForTests());

/** A directory row: the id and the upstream's per-token price strings for its four legs. */
const pricedRow = (id: string, prompt: string, completion: string, cacheRead: string, cacheWrite: string) => ({
  id,
  pricing: { prompt, completion, input_cache_read: cacheRead, input_cache_write: cacheWrite },
});

/** `-1` is the upstream's "this model does not serve that leg" sentinel. */
const NOT_APPLICABLE = "-1";

describe("parseDirectoryRows", () => {
  it("scales legs to per-million and nulls the -1 sentinels", () => {
    const { entry } = parseDirectoryRows([
      pricedRow("acme/dynamic-model", "0.000001", "0.000002", NOT_APPLICABLE, NOT_APPLICABLE),
      pricedRow("acme/cached-model", "0.000003", "0.000015", "0.0000003", "0.00000375"),
    ]);
    expect(entry.pricing["acme/dynamic-model"]).toEqual({
      input: 1,
      output: 2,
      cacheHit: null,
      cacheWrite: null,
    });
    expect(entry.pricing["acme/cached-model"]).toEqual({
      input: 3,
      output: 15,
      cacheHit: 0.3,
      cacheWrite: 3.75,
    });
  });

  it("mirrors a variant id onto its canonical slug", () => {
    const { entry } = parseDirectoryRows([
      {
        id: "acme/model-2:free",
        canonical_slug: "acme/model-2-20260910",
        pricing: { prompt: "0", completion: "0" },
      },
    ]);
    const free = { input: 0, output: 0, cacheHit: null, cacheWrite: null };
    expect(entry.pricing["acme/model-2:free"]).toEqual(free);
    expect(entry.pricing["acme/model-2-20260910:free"]).toEqual(free);
  });
});
