import { describe, expect, it } from "vitest";
import { handleApi } from "./router";
import { SOURCES } from "@/server/sources/registry";
import type { Env } from "@/server/context";

const env: Env = {};

describe("handleApi", () => {
  it("returns undefined for unknown routes so the entrypoint renders 404", async () => {
    const url = new URL("https://example.com/api/does-not-exist");
    await expect(handleApi(new Request(url), env, url)).toBeUndefined();
  });

  it("keeps every source path under /api/*", () => {
    expect(SOURCES.length).toBeGreaterThan(0);
    for (const s of SOURCES) expect(s.path.startsWith("/api/")).toBe(true);
  });
});
