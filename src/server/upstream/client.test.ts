import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpClient } from "./client";
import { USER_AGENT } from "./upstream";

const fetchSpy = vi.spyOn(globalThis, "fetch");

afterEach(() => {
  fetchSpy.mockReset();
});

function abortedSignal(name: string, message: string): AbortSignal {
  const controller = new AbortController();
  controller.abort(new DOMException(message, name));
  return controller.signal;
}

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

function alwaysRespond(make: () => Response): void {
  fetchSpy.mockImplementation(async () => make());
}

function headersOfCall(index = 0): Record<string, string> {
  return fetchSpy.mock.calls[index]![1]!.headers as Record<string, string>;
}

describe("HttpClient abort classification", () => {
  it("reports a caller hang-up as a 499 ClientAbortError", async () => {
    alwaysRespond(() => okJson({ ok: true }));
    const http = new HttpClient({ signal: abortedSignal("AbortError", "gone") });
    await expect(http.getFeed("https://example.test/feed", "application/rss+xml", 1024)).rejects.toMatchObject({
      name: "ClientAbortError",
      status: 499,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports an expired execution budget as a 504 timeout instead of a hang-up", async () => {
    alwaysRespond(() => okJson({ ok: true }));
    const http = new HttpClient({ signal: abortedSignal("TimeoutError", "Timed out") });
    await expect(http.getFeed("https://example.test/feed", "application/rss+xml", 1024)).rejects.toMatchObject({
      name: "UpstreamError",
      status: 504,
      causedByTimeout: true,
    });
  });

  it("reports an already-aborted per-call signal as a 499 without touching fetch", async () => {
    alwaysRespond(() => okJson({ ok: true }));
    const http = new HttpClient();
    await expect(
      http.text("https://example.test/feed", { signal: abortedSignal("AbortError", "gone") }),
    ).rejects.toMatchObject({ name: "ClientAbortError", status: 499 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("still returns the body for a healthy request", async () => {
    alwaysRespond(() => okJson({ ok: true }));
    const http = new HttpClient();
    await expect(http.getJson("https://example.test/x")).resolves.toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("HttpClient status handling", () => {
  it("throws a non-retryable 429 immediately and surfaces Retry-After as milliseconds", async () => {
    alwaysRespond(() => new Response(null, { status: 429, headers: { "retry-after": "3" } }));
    const http = new HttpClient();

    await expect(http.getJson("https://example.test/limited")).rejects.toMatchObject({
      name: "UpstreamError",
      statusCode: 429,
      retryable: false,
      retryAfterMs: 3000,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("throws on a 404 without retrying", async () => {
    alwaysRespond(() => new Response("missing", { status: 404 }));
    const http = new HttpClient();

    await expect(http.getJson("https://example.test/missing")).rejects.toMatchObject({
      name: "UpstreamError",
      statusCode: 404,
      retryable: false,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries a 500 once and returns the body when the retry succeeds", async () => {
    fetchSpy
      .mockImplementationOnce(async () => new Response("boom", { status: 500 }))
      .mockImplementationOnce(async () => okJson({ ok: true }));
    const http = new HttpClient();

    await expect(http.getJson("https://example.test/flaky")).resolves.toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("throws the last UpstreamError once the retries are exhausted", async () => {
    alwaysRespond(() => new Response("boom", { status: 500 }));
    const http = new HttpClient();

    await expect(http.getJson("https://example.test/down")).rejects.toMatchObject({
      name: "UpstreamError",
      statusCode: 500,
      retryable: false,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("throws instead of buffering when the body exceeds maxBytes", async () => {
    alwaysRespond(() => new Response("x".repeat(64), { status: 200 }));
    const http = new HttpClient();

    await expect(http.text("https://example.test/big", undefined, 16)).rejects.toMatchObject({
      name: "UpstreamError",
      message: expect.stringContaining("payload too large"),
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("HttpClient headers", () => {
  it("sends the shared User-Agent and the JSON accept header", async () => {
    alwaysRespond(() => okJson({ ok: true }));
    await new HttpClient().getJson("https://example.test/headers");
    expect(headersOfCall()).toEqual({ "user-agent": USER_AGENT, accept: "application/json" });
  });

  it("uses the HTML accept header and the RSC marker for RSC reads", async () => {
    alwaysRespond(() => new Response("<html></html>", { status: 200 }));
    await new HttpClient().getRsc("https://example.test", "/page");
    expect(headersOfCall()).toEqual({
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml,*/*",
      RSC: "1",
    });
  });

  it("lets a per-call accept header replace the default without dropping the User-Agent", async () => {
    alwaysRespond(() => new Response("<rss></rss>", { status: 200 }));
    await new HttpClient().getFeed("https://example.test/feed", "application/rss+xml", 1024);
    expect(headersOfCall()).toEqual({ "user-agent": USER_AGENT, accept: "application/rss+xml" });
  });
});
