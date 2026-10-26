import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpClient } from "./client";
import { USER_AGENT } from "./upstream";

/** The body every healthy stub serves. */
const OK_JSON = { ok: true };

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

/** Stubs every fetch with a healthy JSON response: the setup of every case that is not about a status code. */
function healthyJson(): void {
  alwaysRespond(() => okJson(OK_JSON));
}

function headersOfCall(index = 0): Record<string, string> {
  return fetchSpy.mock.calls[index]![1]!.headers as Record<string, string>;
}

describe("HttpClient abort classification", () => {
  it.each<[title: string, reason: string, message: string, expected: object]>([
    [
      "reports a caller hang-up as a 499 ClientAbortError",
      "AbortError",
      "gone",
      { name: "ClientAbortError", status: 499 },
    ],
    [
      "reports an expired execution budget as a 504 timeout instead of a hang-up",
      "TimeoutError",
      "Timed out",
      { name: "UpstreamError", status: 504, causedByTimeout: true },
    ],
  ])("%s", async (_title, reason, message, expected) => {
    healthyJson();
    const http = new HttpClient({ signal: abortedSignal(reason, message) });
    await expect(http.getFeed("https://example.test/feed", "application/rss+xml", 1024)).rejects.toMatchObject(
      expected,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports an already-aborted per-call signal as a 499 without touching fetch", async () => {
    healthyJson();
    await expect(
      new HttpClient().text("https://example.test/feed", { signal: abortedSignal("AbortError", "gone") }),
    ).rejects.toMatchObject({ name: "ClientAbortError", status: 499 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("still returns the body for a healthy request", async () => {
    healthyJson();
    await expect(new HttpClient().json("https://example.test/x")).resolves.toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("HttpClient status handling", () => {
  it.each<[title: string, path: string, make: () => Response, expected: object]>([
    [
      "throws a non-retryable 429 immediately and surfaces Retry-After as milliseconds",
      "limited",
      () => new Response(null, { status: 429, headers: { "retry-after": "3" } }),
      { name: "UpstreamError", statusCode: 429, retryable: false, retryAfterMs: 3000 },
    ],
    [
      "throws on a 404 without retrying",
      "missing",
      () => new Response("missing", { status: 404 }),
      { name: "UpstreamError", statusCode: 404, retryable: false },
    ],
  ])("%s", async (_title, path, make, expected) => {
    alwaysRespond(make);
    await expect(new HttpClient().json(`https://example.test/${path}`)).rejects.toMatchObject(expected);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries a 500 once and returns the body when the retry succeeds", async () => {
    fetchSpy
      .mockImplementationOnce(async () => new Response("boom", { status: 500 }))
      .mockImplementationOnce(async () => okJson(OK_JSON));
    const http = new HttpClient();

    await expect(http.json("https://example.test/flaky")).resolves.toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("throws the last UpstreamError once the retries are exhausted", async () => {
    alwaysRespond(() => new Response("boom", { status: 500 }));
    const http = new HttpClient();

    await expect(http.json("https://example.test/down")).rejects.toMatchObject({
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
  it.each<[title: string, call: (http: HttpClient) => Promise<unknown>, expected: Record<string, string>]>([
    [
      "sends the shared user-agent and the json accept header",
      (http) => http.json("https://example.test/headers"),
      { "user-agent": USER_AGENT, accept: "application/json" },
    ],
    [
      "uses the html accept header and the RSC marker for RSC reads",
      (http) => http.getRsc("https://example.test", "/page"),
      { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,*/*", RSC: "1" },
    ],
    [
      "lets a per-call accept header replace the default without dropping the user-agent",
      (http) => http.getFeed("https://example.test/feed", "application/rss+xml", 1024),
      { "user-agent": USER_AGENT, accept: "application/rss+xml" },
    ],
  ])("%s", async (_title, call, expected) => {
    healthyJson();
    await call(new HttpClient());
    expect(headersOfCall()).toEqual(expected);
  });
});
