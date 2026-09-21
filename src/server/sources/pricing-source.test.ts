import { beforeEach, describe, expect, it } from "vitest";
import { getOfficialPricing } from "@/server/sources/pricing-source";
import { resetModuleCachesForTests } from "@/server/infra/cache/service";
import { testCtx } from "@/server/test-helpers";
import type { AppContext } from "@/server/context";

function litellmTable() {
  return {
    sample_spec: { mode: "chat" },
    "openai/gpt-5": {
      mode: "chat",
      litellm_provider: "openai",
      input_cost_per_token: 0.00000125,
      output_cost_per_token: 0.00001,
    },
    "anthropic/claude-opus-4": {
      mode: "chat",
      litellm_provider: "anthropic",
      input_cost_per_token: 0.000015,
      output_cost_per_token: 0.000075,
      cache_read_input_token_cost: 0.0000015,
      cache_creation_input_token_cost: 0.00001875,
    },
    "text-embedding-ada-002": { mode: "embedding", input_cost_per_token: 0.0000001 },
  };
}

function pricingCtx(body: unknown) {
  const calls: { url: string; init: unknown }[] = [];
  const http = {
    json: async (url: string, init?: unknown) => {
      calls.push({ url, init });
      if (body instanceof Error) throw body;
      return body;
    },
  } as unknown as AppContext["http"];
  const { ctx, kvStore } = testCtx(new Map<string, string>(), { http });
  return { ctx, kvStore, calls };
}

describe("getOfficialPricing", () => {
  beforeEach(() => resetModuleCachesForTests());

  it("scales per-token costs to per-million and resolves providers", async () => {
    const { ctx } = pricingCtx(litellmTable());
    const payload = await getOfficialPricing(ctx);
    expect(payload.models).toEqual([
      {
        id: "gpt-5",
        name: "Gpt 5",
        provider: "openai",
        input: 1.25,
        cachedInput: null,
        cacheWrite: null,
        output: 10,
      },
      {
        id: "claude-opus-4",
        name: "Claude Opus 4",
        provider: "anthropic",
        input: 15,
        cachedInput: 1.5,
        cacheWrite: 18.75,
        output: 75,
      },
    ]);
    expect(Number.isNaN(Date.parse(payload.fetchedAt))).toBe(false);
  });

  it("rejects a non-object payload", async () => {
    const { ctx } = pricingCtx(null);
    await expect(getOfficialPricing(ctx)).rejects.toThrowError("LiteLLM pricing returned a non-object payload");
  });

  it("rejects a table with no usable rows as schema drift", async () => {
    const { ctx } = pricingCtx({ "mystery-model": { mode: "chat", output_cost_per_token: 0.000001 } });
    await expect(getOfficialPricing(ctx)).rejects.toThrowError("LiteLLM pricing yielded 0 usable rows (schema drift?)");
  });

  it("propagates an upstream failure and cools down instead of hammering", async () => {
    const { ctx, calls, kvStore } = pricingCtx(new Error("404 from raw.githubusercontent"));
    await expect(getOfficialPricing(ctx)).rejects.toThrowError("404 from raw.githubusercontent");
    expect(kvStore.size).toBe(0);
    await expect(getOfficialPricing(ctx)).rejects.toThrowError(/failure cooldown/);
    expect(calls).toHaveLength(1);
  });
});
