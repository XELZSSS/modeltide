import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:workers";
import { reset } from "cloudflare:test";
import worker from "@/server/worker";
import { upstreamConfig } from "@/shared/config";

// End-to-end Worker API tests running inside the workerd test runtime with mocked upstreams.
const OR = upstreamConfig.openrouter;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function mockUpstream(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/v1/models") {
      return jsonResponse({
        data: [{ id: "openai/gpt-5", pricing: { prompt: "1", completion: "2", input_cache_read: "0.1" } }],
      });
    }
    if (url.pathname === "/api/frontend/v1/rankings/models") {
      return jsonResponse({
        data: [
          {
            date: "2026-08-01",
            model_permaslug: "openai/gpt-5",
            variant: "OpenAI GPT-5",
            variant_permaslug: "openai/gpt-5",
            total_prompt_tokens: 100,
            total_completion_tokens: 50,
            count: 10,
            change: 1,
          },
        ],
      });
    }
    return jsonResponse({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Worker API integration (workerd runtime)", () => {
  beforeEach(async () => {
    await reset();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves /api/openrouter-rankings from a mocked upstream", async () => {
    const fetchMock = mockUpstream();

    const res = await worker.fetch(new Request(`${OR}/api/openrouter-rankings`), env);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: {
        tokenUsageRankings: {
          name: string;
          creator: string;
          totalTokens: number;
          pricing: { prompt: number; input_cache_read: number };
        }[];
      };
    };
    expect(body.data.tokenUsageRankings).toHaveLength(1);
    const entry = body.data.tokenUsageRankings[0]!;
    expect(entry.name).toBe("GPT 5");
    expect(entry.creator).toBe("OpenAI");
    expect(entry.totalTokens).toBe(150);
    expect(entry.pricing.prompt).toBe(1);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("attaches pricing via canonical_slug for dated ranking slugs", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/v1/models") {
        return jsonResponse({
          data: [
            {
              id: "google/gemini-3.7-flash",
              canonical_slug: "google/gemini-3.7-flash-20260813",
              pricing: { prompt: "0.0000014", completion: "0.0000044", input_cache_read: "0.0000001" },
            },
          ],
        });
      }
      if (url.pathname === "/api/frontend/v1/rankings/models") {
        return jsonResponse({
          data: [
            {
              date: "2026-08-01",
              model_permaslug: "google/gemini-3.7-flash-20260813",
              variant: "standard",
              variant_permaslug: "google/gemini-3.7-flash-20260813",
              total_prompt_tokens: 100,
              total_completion_tokens: 50,
              count: 10,
              change: null,
            },
          ],
        });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await worker.fetch(new Request(`${OR}/api/openrouter-rankings`), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        tokenUsageRankings: {
          promptTokens: number;
          completionTokens: number;
          pricing?: { prompt: number; completion: number; input_cache_read: number };
        }[];
      };
    };
    const entry = body.data.tokenUsageRankings[0]!;
    expect(entry.promptTokens).toBe(100);
    expect(entry.completionTokens).toBe(50);
    expect(entry.pricing).toBeDefined();
    expect(entry.pricing?.prompt).toBeCloseTo(0.0000014);
    expect(entry.pricing?.completion).toBeCloseTo(0.0000044);
    expect(entry.pricing?.input_cache_read).toBeCloseTo(0.0000001);
  });

  it("serves repeated requests from the KV cache without refetching upstream", async () => {
    const fetchMock = mockUpstream();

    const url = new Request(`${OR}/api/openrouter-rankings`);
    const first = await worker.fetch(url, env);
    expect(first.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const second = await worker.fetch(new Request(`${OR}/api/openrouter-rankings`), env);
    expect(second.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns 404 JSON for unknown API routes", async () => {
    const res = await worker.fetch(new Request(`${OR}/api/nope`), env);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: number } };
    expect(body.error.code).toBe(404);
  });

  it("returns 400 JSON for invalid query params", async () => {
    const res = await worker.fetch(new Request(`${OR}/api/news?category=bogus`), env);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: number } };
    expect(body.error.code).toBe(400);
  });

  it("returns 502 JSON when the upstream is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({}, 500)),
    );

    const res = await worker.fetch(new Request(`${OR}/api/openrouter-rankings`), env);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: number; message: string } };
    expect(body.error.code).toBe(502);
  });
});
