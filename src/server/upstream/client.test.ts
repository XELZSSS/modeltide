import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientAbortError, UpstreamError } from "@/server/api/errors";
import { HttpClient } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HttpClient abort classification", () => {
  it("reports a watchdog deadline as a retryable timeout, not a client abort", async () => {
    // The shared refresh context hands the client an AbortSignal.timeout(); its reason is a
    // TimeoutError. That must surface as 504-worthy, since the caller is still connected.
    const http = new HttpClient({ signal: AbortSignal.timeout(1) });
    await new Promise((resolve) => setTimeout(resolve, 10));

    const err = await http.getJson("https://example.com/slow").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).causedByTimeout).toBe(true);
    expect(err).not.toBeInstanceOf(ClientAbortError);
  });

  it("keeps a caller hang-up classified as a client abort", async () => {
    const controller = new AbortController();
    const http = new HttpClient({ signal: controller.signal });
    controller.abort();

    const err = await http.getJson("https://example.com/slow").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ClientAbortError);
  });
});
