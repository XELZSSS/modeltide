import { describe, expect, it } from "vitest";
import { buildContext, type Env } from "@/server/context";
import { fetchProviderStatuses } from "./incident-source";

function stubFetch(handler: (url: string) => Response): typeof fetch {
  return ((url: unknown) => Promise.resolve(handler(String(url)))) as typeof fetch;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function healthySummary(): Record<string, unknown> {
  return {
    components: [{ name: "API", status: "operational" }],
    status: { indicator: "none", description: "All Systems Operational" },
    incidents: [],
  };
}

describe("fetchProviderStatuses", () => {
  it("marks a WAF-rejected check (HTTP 405) as unknown, not down", async () => {
    const ctx = buildContext({} as Env, {
      fetchImpl: stubFetch((url) =>
        url.includes("status.claude.com") ? new Response("<html>Human Verification</html>", { status: 405 }) : jsonResponse(200, healthySummary()),
      ),
    });
    const statuses = await fetchProviderStatuses(ctx);
    const anthropic = statuses.get("anthropicApi");
    expect(anthropic).toBeDefined();
    expect(anthropic?.ok).toBe(true);
    expect(anthropic?.warn).toBe(true);
    expect(anthropic?.error).toBeNull();
    expect(anthropic?.warnReason).toMatch(/rejected/);
  });

  it("still marks a genuine server error as down", async () => {
    const ctx = buildContext({} as Env, {
      fetchImpl: stubFetch(() => jsonResponse(500, { error: "boom" })),
    });
    const statuses = await fetchProviderStatuses(ctx);
    for (const agg of statuses.values()) {
      expect(agg.ok).toBe(false);
      expect(agg.warn).toBe(false);
    }
  });

  it("marks healthy providers as ok", async () => {
    const ctx = buildContext({} as Env, {
      fetchImpl: stubFetch((url) =>
        url.includes("status.cloud.google.com") ? jsonResponse(200, []) : jsonResponse(200, healthySummary()),
      ),
    });
    const statuses = await fetchProviderStatuses(ctx);
    expect(statuses.size).toBeGreaterThan(0);
    for (const agg of statuses.values()) {
      expect(agg.ok).toBe(true);
      expect(agg.warn).toBe(false);
    }
  });
});
