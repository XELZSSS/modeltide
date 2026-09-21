import { describe, expect, it } from "vitest";
import { cronHealthy } from "./index";

describe("cronHealthy", () => {
  it("stays healthy when the round was skipped because another isolate held the lock", () => {
    // `null` is the normal lock-held skip — it used to be conflated with a KV
    // read failure, which kept the monitor green through an outage.
    expect(cronHealthy(null, 0, 0)).toBe(true);
    expect(cronHealthy(null, 1, 8)).toBe(true);
  });

  it("is unhealthy when status sampling ran and failed", () => {
    expect(cronHealthy(false, 0, 0)).toBe(false);
    expect(cronHealthy(false, 1, 8)).toBe(false);
  });

  it("is unhealthy when every warmup call failed", () => {
    expect(cronHealthy(true, 8, 8)).toBe(false);
    expect(cronHealthy(null, 8, 8)).toBe(false);
  });

  it("tolerates a partial warmup failure and an empty task list", () => {
    expect(cronHealthy(true, 1, 8)).toBe(true);
    expect(cronHealthy(true, 0, 0)).toBe(true);
  });
});
