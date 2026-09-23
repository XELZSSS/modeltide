import { beforeEach, describe, expect, it } from "vitest";
import { getOpenRouterRankings } from "@/server/sources/openrouter-source";
import { getModelDirectory } from "@/server/sources/openrouter-directory";
import { resetModuleCachesForTests } from "@/server/infra/cache/service";
import { fakeHttp, testCtx } from "@/server/test-helpers";
import { UpstreamError } from "@/server/infra/errors";
import { upstreamConfig, upstreamEndpoints } from "@/server/config";
import { PARTIAL_FAIL_TTL_MS } from "@/shared/config";
import type { ModelRow, PricingRow } from "@/server/parsers/upstream-types";

const RANKINGS_URL = `${upstreamConfig.openrouter}${upstreamEndpoints.openRouterRankings}`;
const DIRECTORY_URL = `${upstreamConfig.openrouter}${upstreamEndpoints.openRouterDirectory}`;
const RANKINGS_KEY = "v-test:openrouter-rankings";

function row(over: Partial<ModelRow> = {}): ModelRow {
  return {
    date: "2026-08-01",
    model_permaslug: "openai/gpt-5",
    variant: "std",
    variant_permaslug: "openai/gpt-5",
    total_completion_tokens: 50,
    total_prompt_tokens: 100,
    total_native_tokens_reasoning: 10,
    total_native_tokens_cached: 0,
    count: 2,
    total_tool_calls: 0,
    change: 1,
    ...over,
  };
}

function directoryRow(id: string): PricingRow {
  return { id, pricing: { prompt: "0.000001", completion: "0.000002" } };
}

function orCtx(responses: Record<string, unknown>) {
  const hits: Record<string, number> = {};
  const logs: [string, string][] = [];
  const { ctx, kvStore } = testCtx(new Map<string, string>(), {
    http: fakeHttp({
      json: (url) => {
        hits[url] = (hits[url] ?? 0) + 1;
        const entry = responses[url];
        if (entry instanceof Error) throw entry;
        if (entry === undefined) throw new Error(`unexpected request to ${url}`);
        return entry;
      },
    }),
    log: (level, msg) => logs.push([level, msg]),
  });
  return { ctx, kvStore, hits, logs };
}

const storedTtl = (kvStore: Map<string, string>) => (JSON.parse(kvStore.get(RANKINGS_KEY) ?? "{}") as { t?: number }).t;

describe("getOpenRouterRankings", () => {
  beforeEach(() => resetModuleCachesForTests());

  it("joins directory pricing onto the ranked rows", async () => {
    const { ctx } = orCtx({
      [RANKINGS_URL]: {
        data: [row(), row({ model_permaslug: "acme/coder", total_prompt_tokens: 10, total_completion_tokens: 5 })],
      },
      [DIRECTORY_URL]: { data: [directoryRow("openai/gpt-5"), directoryRow("acme/coder")] },
    });
    const payload = await getOpenRouterRankings(ctx);
    expect(payload.partial).toBeUndefined();
    expect(payload.data.map((r) => r.id)).toEqual(["openai/gpt-5", "acme/coder"]);
    expect(payload.data[0]?.pricing).toEqual({ input: 1, output: 2, cacheHit: null, cacheWrite: null });
    expect(payload.data[0]?.rank).toBe(1);
    expect(payload.data[0]?.change).toBe(100);
  });

  it("serves rankings without pricing when the directory fails", async () => {
    const { ctx, kvStore, logs } = orCtx({
      [RANKINGS_URL]: { data: [row()] },
      [DIRECTORY_URL]: new Error("directory down"),
    });
    const payload = await getOpenRouterRankings(ctx);
    expect(payload.partial).toBe(true);
    expect(payload.data[0]?.pricing).toBeUndefined();
    expect(logs.some(([level, msg]) => level === "warn" && msg.includes("directory empty"))).toBe(true);
    expect(storedTtl(kvStore)).toBeLessThanOrEqual(PARTIAL_FAIL_TTL_MS);
  });

  it("marks the payload partial when a ranking row is discarded by schema drift", async () => {
    const { ctx, kvStore, logs } = orCtx({
      [RANKINGS_URL]: { data: [row(), { model_permaslug: "", total_prompt_tokens: 1 }] },
      [DIRECTORY_URL]: { data: [directoryRow("openai/gpt-5")] },
    });
    const payload = await getOpenRouterRankings(ctx);
    expect(payload.partial).toBe(true);
    expect(payload.data).toHaveLength(1);
    expect(logs.some(([level, msg]) => level === "warn" && msg.includes("schema drift"))).toBe(true);
    expect(storedTtl(kvStore)).toBeLessThanOrEqual(PARTIAL_FAIL_TTL_MS);
  });

  it("marks the payload partial when a directory row lacks usable pricing", async () => {
    const { ctx, kvStore } = orCtx({
      [RANKINGS_URL]: { data: [row()] },
      [DIRECTORY_URL]: {
        data: [directoryRow("openai/gpt-5"), { id: "broken/model", pricing: { prompt: "oops" } }],
      },
    });
    const payload = await getOpenRouterRankings(ctx);
    expect(payload.partial).toBe(true);
    expect(storedTtl(kvStore)).toBeLessThanOrEqual(PARTIAL_FAIL_TTL_MS);
  });

  it("keeps the timeout marker so the route answers 504 rather than 502", async () => {
    const { ctx } = orCtx({
      [RANKINGS_URL]: new UpstreamError("upstream timed out", { timeout: true }),
      [DIRECTORY_URL]: { data: [] },
    });
    const err = await getOpenRouterRankings(ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).causedByTimeout).toBe(true);
    expect((err as UpstreamError).status).toBe(504);
  });

  it("rejects malformed rankings bodies", async () => {
    const { ctx: nonArray } = orCtx({ [RANKINGS_URL]: { data: null }, [DIRECTORY_URL]: { data: [] } });
    await expect(getOpenRouterRankings(nonArray)).rejects.toThrowError(/non-array response/);

    // Rejections arm the shared failure cooldown: reset so the next body is actually parsed.
    resetModuleCachesForTests();
    const { ctx: badSlugs } = orCtx({
      [RANKINGS_URL]: { data: [row({ model_permaslug: "" }), row({ model_permaslug: "javascript:alert(1)" })] },
      [DIRECTORY_URL]: { data: [directoryRow("openai/gpt-5")] },
    });
    await expect(getOpenRouterRankings(badSlugs)).rejects.toThrowError(
      /all 2 ranking rows had invalid model_permaslug/,
    );
  });

  it("keeps the cached payload and fetchedAt on a cache hit", async () => {
    const { ctx, hits, kvStore } = orCtx({
      [RANKINGS_URL]: { data: [row()] },
      [DIRECTORY_URL]: { data: [directoryRow("openai/gpt-5")] },
    });
    const first = await getOpenRouterRankings(ctx);
    const second = await getOpenRouterRankings(ctx);
    expect(second).toEqual(first);
    expect(hits[RANKINGS_URL]).toBe(1);
    expect(hits[DIRECTORY_URL]).toBe(1);
    expect(storedTtl(kvStore)).toBeGreaterThan(0);
  });
});

describe("getModelDirectory", () => {
  beforeEach(() => resetModuleCachesForTests());

  it("indexes pricing by normalized lowercase id", async () => {
    const { ctx, hits } = orCtx({ [DIRECTORY_URL]: { data: [directoryRow("OpenAI/GPT-5")] } });
    const entry = await getModelDirectory(ctx);
    expect(Object.keys(entry.pricing)).toEqual(["openai/gpt-5"]);
    expect(entry.pricing["openai/gpt-5"]).toMatchObject({ input: 1, output: 2 });
    await getModelDirectory(ctx);
    expect(hits[DIRECTORY_URL]).toBe(1);
  });

  it("degrades a non-array directory body to an empty pricing error", async () => {
    const { ctx } = orCtx({ [DIRECTORY_URL]: { data: "nope" } });
    await expect(getModelDirectory(ctx)).rejects.toThrowError(/empty pricing response \(raw=0, kept=0\)/);
  });
});
