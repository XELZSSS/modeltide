import { describe, expect, it } from "vitest";
import { handleApi } from "./api-router";
import type { Env } from "@/server/context";

const env: Env = {};

describe("handleApi", () => {
  it("returns undefined for unknown routes so the entrypoint renders 404", async () => {
    const url = new URL("https://example.com/api/does-not-exist");
    await expect(handleApi(new Request(url), env, url)).toBeUndefined();
  });
});
