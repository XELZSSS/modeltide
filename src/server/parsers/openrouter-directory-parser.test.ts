import { describe, expect, it, beforeEach } from "vitest";
import { resetModuleCachesForTests } from "@/server/infra/cache/service";
import { parseDirectoryRows } from "@/server/parsers/openrouter-directory-parser";

beforeEach(() => resetModuleCachesForTests());

describe("parseDirectoryRows", () => {
  it("scales legs to per-million, nulling -1 sentinels", () => {
    const entry = parseDirectoryRows([
      {
        id: "acme/dynamic-model",
        pricing: {
          prompt: "0.000001",
          completion: "0.000002",
          input_cache_read: "-1",
          input_cache_write: "-1",
        },
      },
      {
        id: "acme/cached-model",
        pricing: {
          prompt: "0.000003",
          completion: "0.000015",
          input_cache_read: "0.0000003",
          input_cache_write: "0.00000375",
        },
      },
    ]);
    expect(entry.entry.pricing["acme/dynamic-model"]).toEqual({
      input: 1,
      output: 2,
      cacheHit: null,
      cacheWrite: null,
    });
    expect(entry.entry.pricing["acme/cached-model"]).toEqual({
      input: 3,
      output: 15,
      cacheHit: 0.3,
      cacheWrite: 3.75,
    });
  });

  it("mirrors a variant id onto its canonical slug", () => {
    const {
      entry: { pricing: record },
    } = parseDirectoryRows([
      {
        id: "acme/model-2:free",
        canonical_slug: "acme/model-2-20260910",
        pricing: { prompt: "0", completion: "0" },
      },
    ]);
    const free = { input: 0, output: 0, cacheHit: null, cacheWrite: null };
    expect(record["acme/model-2:free"]).toEqual(free);
    expect(record["acme/model-2-20260910:free"]).toEqual(free);
  });
});
