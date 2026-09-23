import { describe, expect, it } from "vitest";
import { cachedPayload, requireRows } from "@/server/sources/pipeline";
import { runLegs, type LegFailure } from "@/server/sources/join-legs";
import { ClientAbortError, UpstreamError } from "@/server/infra/errors";
import { testCtx } from "@/server/test-helpers";
import { PARTIAL_FAIL_TTL_MS } from "@/shared/config";

function storedTtl(kvStore: Map<string, string>, key: string): number {
  const raw = kvStore.get(`v-test:${key}`);
  if (!raw) throw new Error(`no cache entry for ${key}`);
  return (JSON.parse(raw) as { t: number }).t;
}

describe("pipeline primitives", () => {
  it("requireRows passes rows through and reports an empty upstream as an error", () => {
    expect(requireRows([1, 2], "hf models", "rows")).toEqual([1, 2]);
    expect(() => requireRows([], "hf models", "models", "trendingScore")).toThrow(
      "hf models yielded 0 models (trendingScore)",
    );
  });

  it("cachedPayload wraps rows into a payload with no partial flag", async () => {
    const { ctx, kvStore } = testCtx();
    const payload = await cachedPayload(ctx, "complete", 30 * 60_000, async () => ({ rows: [1, 2, 3] }));
    expect(payload.data).toEqual([1, 2, 3]);
    expect(payload.partial).toBeUndefined();
    expect(Number.isNaN(Date.parse(payload.fetchedAt))).toBe(false);
    expect(storedTtl(kvStore, "complete")).toBeGreaterThan(30 * 60_000 * 0.9);
  });

  it("cachedPayload flags partial and downgrades the ttl to the partial-failure window", async () => {
    const { ctx, kvStore } = testCtx();
    const ttl = 30 * 60_000;
    const partial = await cachedPayload(ctx, "short", ttl, async () => ({ rows: [1], partial: true }));
    expect(partial.partial).toBe(true);
    const stored = storedTtl(kvStore, "short");
    expect(stored).toBeLessThanOrEqual(PARTIAL_FAIL_TTL_MS);
    expect(stored).toBeGreaterThan(PARTIAL_FAIL_TTL_MS * 0.9);
  });

  it("runLegs keeps one slot per leg in order and names the failures", async () => {
    const { values, failures } = await runLegs(
      [
        { label: "a", run: async () => "A" },
        {
          label: "b",
          run: async () => {
            throw new UpstreamError("b is down");
          },
        },
        { label: "c", run: async () => "C" },
      ],
      { concurrency: 2 },
    );
    expect(values).toEqual(["A", undefined, "C"]);
    expect(failures.map((f) => f.label)).toEqual(["b"]);
    const failure = failures[0] as LegFailure;
    expect(failure.reason).toBeInstanceOf(UpstreamError);
    expect((failure.reason as Error).message).toBe("b is down");
  });

  it("runLegs rethrows the caller's abort when every leg was aborted", async () => {
    const abort = new ClientAbortError("client went away");
    await expect(
      runLegs([
        {
          label: "a",
          run: async () => {
            throw abort;
          },
        },
        {
          label: "b",
          run: async () => {
            throw abort;
          },
        },
      ]),
    ).rejects.toBeInstanceOf(ClientAbortError);
  });
});
