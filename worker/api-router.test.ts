import { describe, expect, it } from "vitest";
import { resolveRoute } from "./api-router";
import { apiPaths } from "@/shared/config";

describe("resolveRoute", () => {
  it("returns undefined for an unknown pathname so the entrypoint renders 404", () => {
    expect(resolveRoute("/api/does-not-exist")).toBeUndefined();
  });

  it("resolves a registered pathname to its route entry", () => {
    expect(resolveRoute(apiPaths.news)?.path).toBe(apiPaths.news);
  });
});
