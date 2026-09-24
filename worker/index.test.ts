import { describe, expect, it, vi } from "vitest";
import { WARM_TASK_TIMEOUT_MS, warmBatchTimeoutMs } from "@/server/config";
import { TaskNotRunError } from "@/server/infra/task-pool";
import { cronHealthy, failTarget, pingCronMonitor, warmRoundOutcome, warmTiersFor } from "./index";

describe("cronHealthy", () => {
  const cases: [string, boolean | null, number, number, boolean][] = [
    ["lock-held skip stays healthy", null, 0, 8, true],
    ["lock-held skip with a partial warmup failure is unhealthy", null, 1, 8, false],
    ["failed status sampling is unhealthy", false, 0, 8, false],
    ["failed status sampling with a partial warmup failure is unhealthy", false, 1, 8, false],
    ["every warmup call failed is unhealthy", true, 8, 8, false],
    ["every warmup call failed behind a lock-held skip is unhealthy", null, 8, 8, false],
    ["partial warmup failure is unhealthy", true, 1, 8, false],
    ["a round the deadline cut off before 7 of its 10 tasks ran is unhealthy", true, 7, 10, false],
    ["a batch that ran nothing is unhealthy", true, 0, 0, false],
    ["a lock-held skip with no warm task at all is unhealthy", null, 0, 0, false],
  ];

  it.each(cases)("%s", (_label, sampled, warmFailed, warmTotal, expected) => {
    expect(cronHealthy(sampled, warmFailed, warmTotal)).toBe(expected);
  });
});

describe("warmRoundOutcome", () => {
  const ok = (): PromiseSettledResult<unknown> => ({ status: "fulfilled", value: undefined });
  const errored = (): PromiseSettledResult<unknown> => ({ status: "rejected", reason: new Error("upstream down") });
  const cutOff = (): PromiseSettledResult<unknown> => ({ status: "rejected", reason: new TaskNotRunError() });
  const times = (n: number, make: () => PromiseSettledResult<unknown>): PromiseSettledResult<unknown>[] =>
    Array.from({ length: n }, make);

  it("counts a round the batch deadline cut off as failures, not as a smaller round", () => {
    const outcome = warmRoundOutcome([...times(7, cutOff), ...times(3, ok)]);
    expect(outcome).toEqual({ notRun: 7, failed: 0, degraded: 0, total: 10 });
    expect(cronHealthy(true, outcome.failed + outcome.notRun, outcome.total)).toBe(false);
  });

  it("keeps never-ran tasks distinct from calls that ran and failed", () => {
    expect(warmRoundOutcome([ok(), errored(), cutOff(), errored()])).toEqual({
      notRun: 1,
      failed: 2,
      degraded: 0,
      total: 4,
    });
  });

  it("counts a resolved call that cached a partial payload as degraded, not as a failure", () => {
    const partial = (): PromiseSettledResult<unknown> => ({ status: "fulfilled", value: { partial: true } });
    const outcome = warmRoundOutcome([ok(), partial(), partial()]);
    expect(outcome).toEqual({ notRun: 0, failed: 0, degraded: 2, total: 3 });
    expect(cronHealthy(true, outcome.failed + outcome.notRun, outcome.total)).toBe(true);
  });

  it("leaves an empty batch to the cronHealthy total guard", () => {
    const outcome = warmRoundOutcome([]);
    expect(outcome).toEqual({ notRun: 0, failed: 0, degraded: 0, total: 0 });
    expect(cronHealthy(true, outcome.failed + outcome.notRun, outcome.total)).toBe(false);
  });
});

describe("warmBatchTimeoutMs", () => {
  it.each([
    ["an empty batch", 0, 2],
    ["one round", 2, 2],
    ["a partial second round", 3, 3],
    ["the off-peak fire (10 tasks)", 10, 6],
    ["the 6-hourly fire (11 tasks)", 11, 7],
  ])("%s budgets %i rounds", (_label, tasks, rounds) => {
    expect(warmBatchTimeoutMs(tasks)).toBe(WARM_TASK_TIMEOUT_MS * rounds);
  });
});

describe("failTarget", () => {
  it.each([
    ["a bare url", "https://hc-ping.com/abc", "https://hc-ping.com/abc/fail"],
    ["a trailing slash", "https://hc-ping.com/abc/", "https://hc-ping.com/abc/fail"],
    ["a query string", "https://hc-ping.com/abc?x=1", "https://hc-ping.com/abc/fail?x=1"],
    ["a trailing slash before a query", "https://hc-ping.com/abc/?x=1", "https://hc-ping.com/abc/fail?x=1"],
    ["a hash", "https://hc-ping.com/abc#frag", "https://hc-ping.com/abc/fail#frag"],
  ])("appends /fail to %s", (_label, input, expected) => {
    expect(failTarget(input)).toBe(expected);
  });
});

describe("pingCronMonitor", () => {
  it("pings the fail endpoint, uncached, when the round is unhealthy", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    try {
      await pingCronMonitor({ STATUS_PING_URL: "https://hc-ping.com/abc" }, false);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toBe("https://hc-ping.com/abc/fail");
      expect(calls[0]?.init?.cache).toBe("no-store");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("stays silent without a ping url", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      calls.push(url);
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    try {
      await pingCronMonitor({}, true);
      expect(calls).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("warmTiersFor", () => {
  const cases: [string, number, number, string[]][] = [
    ["off-peak minute of a non-6th hour", 13, 3, ["core", "hourly"]],
    ["peak minute", 43, 3, ["core"]],
    ["off-peak minute of a 6th hour", 13, 6, ["core", "hourly", "static"]],
    ["peak minute of a 6th hour", 43, 6, ["core"]],
  ];

  it.each(cases)("%s warms %j", (_label, minute, hour, expected) => {
    expect(warmTiersFor(minute, hour)).toEqual(expected);
  });
});
