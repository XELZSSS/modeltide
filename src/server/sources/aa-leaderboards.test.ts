import { describe, expect, it, beforeEach } from "vitest";
import { resetModuleCachesForTests } from "@/server/infra/cache-service";
import { testCtx } from "@/server/test-helpers";
import { getTextToImageLeaderboard } from "@/server/sources/aa/text-to-image";
import { getAgentRankings } from "@/server/sources/agent-arena";
import type { AppContext } from "@/server/context";

beforeEach(() => resetModuleCachesForTests());

const T2I_FLIGHT_BODY = [
  '1:"$Sreact.fragment"',
  '20:{"props":{"textToImage":[{"id":"id-b","slug":"model-b","name":"Model B","url":"/image/model-families/b","elo":1100,"lower95ci":1090,"upper95ci":1110,"creator":{"name":"Org B"},"isDefault":true,"price":38.9},{"id":"id-a","slug":"model-a","name":"Model A","url":"/image/model-families/a","elo":1178.11,"lower95ci":1168.11,"upper95ci":1188.11,"creator":{"name":"Org A"},"isDefault":true,"price":211}]}}',
].join("\n");

describe("getTextToImageLeaderboard (no upstream rank)", () => {
  it("derives ranks from elo order instead of yielding 0 models", async () => {
    const { ctx } = testCtx(new Map(), {
      version: "v-t2i-current-schema",
      http: { text: async () => T2I_FLIGHT_BODY } as unknown as AppContext["http"],
    });
    const payload = await getTextToImageLeaderboard(ctx);
    expect(payload.data).toHaveLength(2);
    expect(payload.data[0]).toMatchObject({
      slug: "model-a",
      rank: 1,
      elo: 1178.11,
      eloLower: 1168.11,
      eloUpper: 1188.11,
    });
    expect(payload.data[1]).toMatchObject({ slug: "model-b", rank: 2, elo: 1100 });
  });

  it("surfaces the RSC scan diagnostic when the marker disappears", async () => {
    const { ctx } = testCtx(new Map(), {
      version: "v-t2i-drift",
      http: { text: async () => '1:{"props":{"other":[1,2,3]}}' } as unknown as AppContext["http"],
    });
    await expect(getTextToImageLeaderboard(ctx)).rejects.toThrowError(
      /Text-to-image parse failed: RSC marker "textToImage" not found .*hash=/,
    );
  });
});

describe("getAgentRankings (RSC flight path)", () => {
  const SIGNALS = [
    "task_outcome_explicit",
    "praise_complaint",
    "steerability",
    "bash_recovery_steps",
    "tool_hallucination",
  ];
  const scores: Record<string, number[]> = {
    "contenders/a": [0.3, 0.3, 0.0, 0.0, 0.0],
    "contenders/b": [0.1, 0.1, 0.1, 0.1, 0.1],
    "contenders/c": [0.2, 0.2, 0.2, 0.2, 0.2],
  };
  const FLIGHT_BODY = [
    "41:" +
      JSON.stringify({
        signals: SIGNALS.map((signal, si) => ({
          name: signal,
          entries: [
            {
              contenderName: "contenders/a",
              model: "A",
              modelOrganization: "Org",
              license: "Proprietary",
              isPublic: true,
              score: scores["contenders/a"]![si]!,
              ciLower: 0,
              ciUpper: 1,
              rank: 1,
            },
            {
              contenderName: "contenders/b",
              model: "B",
              modelOrganization: "Org",
              license: "Proprietary",
              isPublic: true,
              score: scores["contenders/b"]![si]!,
              ciLower: 0,
              ciUpper: 1,
              rank: 1,
            },
            {
              contenderName: "contenders/c",
              model: "C",
              modelOrganization: "Org",
              license: "Proprietary",
              isPublic: true,
              score: scores["contenders/c"]![si]!,
              ciLower: 0,
              ciUpper: 1,
              rank: 1,
            },
            { contenderName: "broken", model: "", score: null },
          ],
        })),
      }),
  ].join("\n");

  it("feeds getAgentRankings through the RSC flight path", async () => {
    const requested: { url: string; rsc: boolean }[] = [];
    const { ctx } = testCtx(new Map(), {
      version: "v-agent-rsc",
      http: {
        text: async (url: string, init: { headers?: Record<string, string> }) => {
          requested.push({ url, rsc: init.headers?.RSC === "1" });
          return FLIGHT_BODY;
        },
      } as unknown as AppContext["http"],
    });
    const payload = await getAgentRankings(ctx);
    expect(requested).toHaveLength(1);
    expect(requested[0]).toMatchObject({ url: expect.stringContaining("/leaderboard/agent"), rsc: true });
    expect(payload.entries).toHaveLength(3);
  });
});
