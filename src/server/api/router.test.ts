import { describe, expect, it } from "vitest";
import { handleApiRoute, type ApiRouteDef } from "./router";
import { API_VERSION_PARAM } from "@/shared/config/api";

function route(overrides: Partial<ApiRouteDef> = {}): ApiRouteDef {
  return {
    handler: async () => ({ data: [], fetchedAt: "2026-01-01T00:00:00.000Z", partial: false }),
    ...overrides,
  };
}

async function call(query: string, def: ApiRouteDef = route()): Promise<Response> {
  const url = new URL(`http://localhost/api/test${query}`);
  return handleApiRoute(new Request(url), {}, url, def);
}

describe("handleApiRoute query validation", () => {
  it("accepts a declared param and the contract version param", async () => {
    const res = await call(
      `?sort=trendingScore&${API_VERSION_PARAM}=sha-abc`,
      route({ query: { sort: { type: "enum", values: ["trendingScore"], default: "trendingScore" } } }),
    );
    expect(res.status).toBe(200);
  });

  it("rejects an unknown param instead of ignoring it", async () => {
    const res = await call("?direction=-1");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("direction");
  });

  it("rejects unknown params even when a valid one is present", async () => {
    const res = await call(`?sort=trendingScore&direction=-1&${API_VERSION_PARAM}=sha-abc`);
    expect(res.status).toBe(400);
  });

  it("strips control characters from the reported param names", async () => {
    const res = await call("?%00bad=1");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).not.toContain("\u0000");
  });
});
