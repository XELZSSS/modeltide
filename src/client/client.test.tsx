import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { MAX_PARTIAL_POLLS, partialPollInterval } from "@/client/api/api-queries";
import { isPartialPayload } from "@/client/api/payload-normalize";
import { ComparePageLayout } from "@/client/features/compare/compare-layout";
import { buildPriceRows, computeWinners } from "@/client/features/compare/compare-logic";
import { pickLatestReleaseName } from "@/client/features/home/use-home-stats";
import { createDetailView } from "@/client/features/models/model-details/detail-views";
import { OpenRouterRankingsView } from "@/client/features/rankings/openrouter-rankings-view";
import { AppShell } from "@/client/components/layout/app-shell";
import { BackButton } from "@/client/components/layout";
import { SuspenseQuery } from "@/client/components/feedback";
import { Providers } from "@/client/providers";
import { navigate, useParams } from "@/client/router";
import { SearchInput } from "@/client/search/search-input";
import { rankSearchHits } from "@/client/search/use-search";
import { useCompareStore, useSearchStore, useSettingsStore } from "@/client/stores";
import { syncSettingsFromStorageEvent } from "@/client/stores/settings-store";
import { calcMonthlyCost } from "@/client/utils/cost-estimator";
import { getCachedMonthlyCost, useMonthlyCosts } from "@/client/pricing/cost-inputs";
import { safeHref } from "@/client/utils/format";
import {
  indexOfficialPricing,
  makeOfficialGetter,
  matchOfficialPricing,
  resolveBlendedPrice,
  resolveEffectivePricing,
} from "@/client/utils/pricing-merge";
import { buildReleaseRows } from "@/client/utils/release-feed";
import { STORAGE_KEYS } from "@/shared/config";
import { createT, type TranslationKey } from "@/shared/i18n";
import type {
  ArtificialAnalysisModel,
  ClosedReleaseEntry,
  OfficialPriceModel,
  OpenRouterRankingsPayload,
  OpenSourceModelEntry,
  SearchResult,
} from "@/shared/types";
import type { OfficialGetter } from "@/client/utils/pricing-merge";
import type { TFunction } from "@/shared/i18n";

const t = createT("en");

interface SearchCall {
  term: string;
  suspended: boolean;
  warm: boolean;
}

/**
 * State for the two mocked hooks. `vi.mock` is hoisted and applies to the whole
 * module graph, so every describe in this file shares these fakes and each test
 * starts from a reset copy.
 */
const mocks = vi.hoisted(() => ({
  rankings: {
    value: { data: [] as ArtificialAnalysisModel[], isPending: true, isError: false, refetch: () => {} },
  },
  search: {
    value: { results: [] as SearchResult[], isPending: false, isError: false },
    calls: [] as SearchCall[],
  },
}));

vi.mock("@/client/api/api-queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/client/api/api-queries")>();
  return { ...actual, useArtificialRankings: () => mocks.rankings.value };
});

vi.mock("@/client/search/use-search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/client/search/use-search")>();
  return {
    ...actual,
    useSearchAllRankings: (term: string, opts?: { suspended?: boolean; warm?: boolean }) => {
      mocks.search.calls.push({ term, suspended: opts?.suspended === true, warm: opts?.warm === true });
      return mocks.search.value;
    },
  };
});

beforeEach(() => {
  mocks.rankings.value = { data: [], isPending: true, isError: false, refetch: () => {} };
  mocks.search.value = { results: [], isPending: false, isError: false };
  mocks.search.calls = [];
});

/** Moves jsdom's history and notifies the router's external store. */
async function goto(url: string) {
  window.history.replaceState(null, "", url);
  await act(async () => {
    window.dispatchEvent(new Event("routechange"));
  });
}

// The repo's vitest setup has no global afterEach, so RTL cleanup is not automatic.
afterEach(async () => {
  cleanup();
  await goto("/");
});

const tKey: TFunction = (key) => key;

function makeModel(over: Partial<ArtificialAnalysisModel>): ArtificialAnalysisModel {
  return { id: "m", slug: "m", name: "M", intelligence_index: null, ...over };
}

function makeOfficial(over: Partial<OfficialPriceModel>): OfficialPriceModel {
  return {
    id: "gpt-5",
    name: "GPT-5",
    provider: "OpenAI",
    input: 5,
    output: 25,
    cachedInput: 0.5,
    cacheWrite: 6.25,
    ...over,
  };
}

function dailyCost(
  model: ArtificialAnalysisModel,
  dailyInput: number,
  dailyOutput: number,
  opts?: { dailyReasoning?: number; cacheHitRate?: number },
): number | null {
  return calcMonthlyCost(model, {
    dailyInput,
    dailyOutput,
    dailyReasoning: opts?.dailyReasoning,
    cacheHitRate: opts?.cacheHitRate ?? 0,
    cacheWriteRate: 0,
    daysPerMonth: 1,
  });
}

describe("safeHref", () => {
  it.each([
    ["/models?tab=x", "/models?tab=x"],
    ["https://ok.example/a", "https://ok.example/a"],
  ])("safeHref allows %s", (input, expected) => {
    expect(safeHref(input)).toBe(expected);
  });

  it.each([["//evil.example"], ["/\\evil.example"], ["javascript:alert(1)"], [null], ["   "]])(
    "safeHref rejects %s",
    (input) => {
      expect(safeHref(input as string)).toBeUndefined();
    },
  );
});

describe("calcMonthlyCost", () => {
  it("scales daily cost by days per month and clamps days to >= 1", () => {
    const model = makeModel({ pricing: { input: 1, output: 2, cacheHit: null } });
    const base = { dailyInput: 1_000_000, dailyOutput: 1_000_000, cacheHitRate: 0, cacheWriteRate: 0 };
    expect(calcMonthlyCost(model, { ...base, daysPerMonth: 22 })).toBe(3 * 22);
    expect(calcMonthlyCost(model, { ...base, daysPerMonth: 0 })).toBe(3);
  });

  it.each([
    ["input+output from per-million prices", { input: 1, output: 2, cacheHit: 0.1 }, [1_000_000, 1_000_000, {}], 3],
    [
      "splits cached/uncached by rate",
      { input: 10, output: 2, cacheHit: 1 },
      [2_000_000, 0, { cacheHitRate: 0.5 }],
      11,
    ],
    [
      "forwards reasoning tokens",
      { input: 10, output: 2, cacheHit: 1 },
      [2_000_000, 0, { dailyReasoning: 1_000_000, cacheHitRate: 0.5 }],
      13,
    ],
    ["clamps low hit rate", { input: 10, output: 2, cacheHit: 1 }, [1_000_000, 0, { cacheHitRate: -1 }], 10],
    ["clamps negative tokens", { input: 1, output: 2, cacheHit: null }, [-5, -5, {}], 0],
  ])("%s", (_label, pricing, args, expected) => {
    const [input, output, opts] = args as [number, number, { dailyReasoning?: number; cacheHitRate?: number }];
    expect(dailyCost(makeModel({ pricing: pricing as never }), input, output, opts)).toBe(expected);
  });

  it("returns null for missing pricing and non-finite tokens", () => {
    expect(dailyCost(makeModel({}), 1_000_000, 1_000_000)).toBeNull();
    expect(dailyCost(makeModel({ pricing: { cacheHit: 0.1 } }), 1_000_000, 1_000_000)).toBeNull();
    expect(
      dailyCost(makeModel({ pricing: { input: 1, output: 2, cacheHit: null } }), Number.NaN, 1_000_000),
    ).toBeNull();
  });
});

describe("buildPriceRows", () => {
  const rows = buildPriceRows(tKey);

  it("marks cheapest win and priciest loss on every leg", () => {
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.bestIs).toBe("min");
      expect(row.worstIs).toBe("max");
    }
    const winners = computeWinners(
      rows,
      [
        makeModel({ id: "cheap", pricing: { input: 1, output: 10 } }),
        makeModel({ id: "mid", pricing: { input: 2, output: 20 } }),
        makeModel({ id: "deep", pricing: { input: 3, output: 30 } }),
      ],
      (m) => m.id,
    );
    expect(winners.get("promptPrice")?.get("cheap")).toBe("win");
    expect(winners.get("promptPrice")?.get("deep")).toBe("loss");
    expect(winners.get("completionPrice")?.get("cheap")).toBe("win");
    expect(winners.get("completionPrice")?.get("deep")).toBe("loss");
  });

  it("ranks on official prices once they arrive instead of the router catalogue", () => {
    const getOfficial: OfficialGetter = (m) =>
      m.id === "cheap" ? makeOfficial({ input: 9, output: 90, cachedInput: 9, cacheWrite: 9 }) : undefined;
    const officialRows = buildPriceRows(tKey, getOfficial);
    const cheap = makeModel({ id: "cheap", pricing: { input: 1, output: 10 } });
    const mid = makeModel({ id: "mid", pricing: { input: 2, output: 20 } });
    const winners = computeWinners(officialRows, [cheap, mid], (m) => m.id);
    expect(winners.get("promptPrice")?.get("mid")).toBe("win");
    expect(winners.get("promptPrice")?.get("cheap")).toBe("loss");
    expect(officialRows[0]?.getNumeric?.(cheap)).toBe(9);
    expect(officialRows[1]?.getNumeric?.(mid)).toBe(20);
  });

  it("does not rank apart two cells that render the same price", () => {
    const tied = computeWinners(
      buildPriceRows(tKey),
      [
        makeModel({ id: "a", pricing: { input: 0.5001, output: 10 } }),
        makeModel({ id: "b", pricing: { input: 0.4999, output: 10 } }),
      ],
      (m) => m.id,
    );
    // Both cells show "$0.50", so neither may be highlighted.
    expect(tied.has("promptPrice")).toBe(false);

    const gap = computeWinners(
      buildPriceRows(tKey),
      [
        makeModel({ id: "a", pricing: { input: 0.51, output: 10 } }),
        makeModel({ id: "b", pricing: { input: 0.49, output: 10 } }),
      ],
      (m) => m.id,
    );
    expect(gap.get("promptPrice")?.get("b")).toBe("win");
    expect(gap.get("promptPrice")?.get("a")).toBe("loss");
  });
});

describe("pruneCompare", () => {
  beforeEach(() => {
    useCompareStore.setState({ compareIds: [], lastExceedAt: null });
  });

  it("drops ids the loaded list no longer contains and keeps the rest in order", () => {
    useCompareStore.setState({ compareIds: ["gone", "kept"], lastExceedAt: 123 });
    useCompareStore.getState().pruneCompare(new Set(["kept", "other"]));
    expect(useCompareStore.getState().compareIds).toEqual(["kept"]);
    expect(useCompareStore.getState().lastExceedAt).toBeNull();
  });

  it("leaves the id array identity alone when nothing is stale", () => {
    useCompareStore.setState({ compareIds: ["a", "b"] });
    const before = useCompareStore.getState().compareIds;
    useCompareStore.getState().pruneCompare(new Set(["a", "b", "c"]));
    expect(useCompareStore.getState().compareIds).toBe(before);
  });

  it("frees the slot a stale id was occupying", () => {
    useCompareStore.setState({ compareIds: ["stale-a", "stale-b"] });
    expect(useCompareStore.getState().toggleCompareModel(makeModel({ id: "new" }))).toBe(false);
    useCompareStore.getState().pruneCompare(new Set(["new"]));
    expect(useCompareStore.getState().compareIds).toEqual([]);
    expect(useCompareStore.getState().toggleCompareModel(makeModel({ id: "new" }))).toBe(true);
    expect(useCompareStore.getState().compareIds).toEqual(["new"]);
  });
});

describe("official price resolution", () => {
  const official = makeOfficial({});
  const index = indexOfficialPricing([official]);

  it.each([
    ["GPT-5 (Reasoning, High Effort)", "gpt-5"],
    ["GPT-5", "gpt-5"],
  ])("matches catalog variant %s to official %s", (name, id) => {
    expect(matchOfficialPricing(index, makeModel({ name }))?.id).toBe(id);
  });

  it.each([
    [
      "official legs win per-leg, catalog fills gaps",
      { input: 10, output: 50, cacheHit: 1 },
      { output: null },
      { input: 5, output: 50, cacheHit: 0.5, cacheWrite: 6.25, source: "official" },
    ],
  ])("%s", (_label, catalog, officialOver, expected) => {
    expect(resolveEffectivePricing(catalog as never, makeOfficial(officialOver))).toEqual(expected);
  });

  it("falls back to catalog without an official match, null source when nothing resolves", () => {
    expect(resolveEffectivePricing({ input: 10, output: 50, cacheHit: 1 })).toEqual({
      input: 10,
      output: 50,
      cacheHit: 1,
      cacheWrite: null,
      source: "catalog",
    });
    expect(resolveEffectivePricing(undefined, null).source).toBeNull();
  });

  it.each([[{ input: 10, output: 50, cacheHit: 1 }, makeOfficial({}), 3.85]])(
    "resolveBlendedPrice(%j)",
    (pricing, officialPrice, expected) => {
      expect(resolveBlendedPrice(makeModel({ pricing: pricing as never }), officialPrice)).toBeCloseTo(expected, 5);
    },
  );

  it("monthly cost uses official legs when matched and bills the write tier", () => {
    const opts = {
      dailyInput: 1_000_000,
      dailyOutput: 1_000_000,
      cacheHitRate: 0,
      cacheWriteRate: 0,
      daysPerMonth: 1,
    };
    const model = makeModel({ pricing: { input: 10, output: 50, cacheHit: null } });
    expect(calcMonthlyCost(model, opts)).toBe(60);
    expect(calcMonthlyCost(model, opts, official)).toBe(30);
    expect(
      calcMonthlyCost(makeModel({ pricing: { input: 10, output: 0, cacheHit: 1, cacheWrite: 30 } as never }), {
        dailyInput: 1_000_000,
        dailyOutput: 0,
        cacheHitRate: 0.5,
        cacheWriteRate: 0.2,
        daysPerMonth: 1,
      }),
    ).toBeCloseTo(0.5 * 1 + 0.2 * 30 + 0.3 * 10, 5);
  });
});

describe("monthly cost default fast path", () => {
  const defaultCalc = { input: 2, output: 1, reasoning: 2, cache: 0.5, cacheWrite: 0.05, days: 22 };

  it("reuses the server precomputed default unless official legs match", () => {
    expect(getCachedMonthlyCost(makeModel({ defaultMonthlyCost: 123 }), defaultCalc, undefined)).toBe(123);
    expect(
      getCachedMonthlyCost(makeModel({ defaultMonthlyCost: 123 }), defaultCalc, makeOfficialGetter([makeOfficial({})])),
    ).toBe(123);
    expect(
      getCachedMonthlyCost(
        makeModel({ name: "GPT-5", defaultMonthlyCost: 123, pricing: { input: 10, output: 50, cacheHit: null } }),
        defaultCalc,
        makeOfficialGetter([makeOfficial({})]),
      ),
    ).toBeCloseTo(1773.75, 5);
  });
});

describe("useMonthlyCosts", () => {
  const gpt = () => makeModel({ id: "gpt-5", name: "GPT-5", pricing: { input: 10, output: 50, cacheHit: null } });
  const cheap = () => makeModel({ id: "cheap", name: "Cheap", pricing: { input: 1, output: 2, cacheHit: null } });

  it("recomputes monthly costs when official pricing arrives after mount", () => {
    const hookModels = [gpt()];
    const { result, rerender } = renderHook(({ getOfficial }) => useMonthlyCosts(hookModels, getOfficial), {
      initialProps: { getOfficial: undefined as OfficialGetter | undefined },
    });
    expect(result.current.monthlyCosts.get("gpt-5")).toBe(3740);
    rerender({ getOfficial: makeOfficialGetter([makeOfficial({})]) });
    expect(result.current.monthlyCosts.get("gpt-5")).toBeCloseTo(1773.75, 5);
  });

  it("emits no catalog numbers before pricing is ready", () => {
    const hookModels = [gpt()];
    const { result, rerender } = renderHook(
      ({ getOfficial, ready }) => useMonthlyCosts(hookModels, getOfficial, { ready }),
      { initialProps: { getOfficial: undefined as OfficialGetter | undefined, ready: false } },
    );
    expect(result.current.monthlyCosts.size).toBe(0);
    rerender({ getOfficial: makeOfficialGetter([makeOfficial({})]), ready: true });
    expect(result.current.monthlyCosts.get("gpt-5")).toBeCloseTo(1773.75, 5);
  });

  it("keys costs by model id so list order cannot shift a cost onto another model", () => {
    const { result } = renderHook(() => useMonthlyCosts([cheap(), gpt()]));
    expect(result.current.monthlyCosts.get("gpt-5")).toBe(3740);
  });
});

describe("pickLatestReleaseName", () => {
  const closed = (releaseDate: string, model = "Closed Model"): ClosedReleaseEntry => ({
    id: model,
    model,
    provider: "Lab",
    releaseDate,
    link: "https://example.com",
  });
  const hf = (id: string, createdAt: string): OpenSourceModelEntry => ({
    id,
    author: null,
    downloads: 0,
    likes: 0,
    license: "apache-2.0",
    task: null,
    createdAt,
    lastModified: null,
    tags: [],
  });

  it.each([
    [[], [closed("2026-09-05"), closed("2026-09-01")], "Closed Model"],
    // Regression: a newer Hugging Face creation must win over the AA head,
    // matching what the releases page shows in its first row.
    [[hf("org/newest", "2026-09-06T04:54:00Z")], [closed("2026-09-05")], "newest"],
    [[], [closed("not-a-date")], null],
  ])("pickLatestReleaseName(%j, %j)", (hfFeed, aaFeed, expected) => {
    expect(pickLatestReleaseName(hfFeed as OpenSourceModelEntry[], aaFeed as ClosedReleaseEntry[])).toBe(expected);
  });
});

describe("buildReleaseRows", () => {
  const hf = (id: string, createdAt: string | null, lastModified: string | null = null): OpenSourceModelEntry => ({
    id,
    author: null,
    downloads: 0,
    likes: 0,
    license: "apache-2.0",
    task: null,
    createdAt,
    lastModified,
    tags: [],
  });
  const aa = (id: string, releaseDate: string): ClosedReleaseEntry => ({
    id,
    model: `Model ${id}`,
    provider: "Lab",
    releaseDate,
    link: `https://example.com/${id}`,
  });

  it("merges both sources into one list, newest first, with no open/closed field", () => {
    const rows = buildReleaseRows([hf("meta-llama/older", "2026-01-01T00:00:00Z")], [aa("newest", "2026-09-05")]);
    expect(rows.map((r) => r.name)).toEqual(["Model newest", "older"]);
    expect(rows.map((r) => r.provider)).toEqual(["Lab", "Hugging Face"]);
    expect(rows.map((r) => r.id)).toEqual(["aa:newest", "hf:meta-llama/older@2026-01-01"]);
    expect(rows.every((r) => !("type" in r))).toBe(true);
  });

  it("collapses same-day create/modify pairs but keeps later-day modifies", () => {
    const sameDay = buildReleaseRows([hf("org/model", "2026-03-04T01:00:00Z", "2026-03-04T23:00:00Z")], []);
    expect(sameDay).toHaveLength(1);
    expect(sameDay[0]?.date).toBe("2026-03-04");
    const laterDay = buildReleaseRows([hf("org/model", "2026-03-04T00:00:00Z", "2026-03-06T00:00:00Z")], []);
    expect(laterDay.map((r) => r.date)).toEqual(["2026-03-06", "2026-03-04"]);
    expect(new Set(laterDay.map((r) => r.id)).size).toBe(2);
  });

  it("drops releases whose date cannot be parsed", () => {
    expect(buildReleaseRows([], [aa("bad", "not-a-date")])).toEqual([]);
  });
});

describe("useParams", () => {
  it("re-parses dynamic segments when the path changes under the same pattern", async () => {
    window.history.replaceState(null, "", "/model/aa/old-model");
    const { result } = renderHook(() => useParams<{ source: string; wildcard: string }>("/model/:source/*"));
    expect(result.current).toEqual({ source: "aa", wildcard: "old-model" });

    window.history.replaceState(null, "", "/model/aa/new-model");
    await act(async () => {
      window.dispatchEvent(new Event("routechange"));
    });
    expect(result.current).toEqual({ source: "aa", wildcard: "new-model" });

    window.history.replaceState(null, "", "/");
    await act(async () => {
      window.dispatchEvent(new Event("routechange"));
    });
    expect(result.current).toEqual({ wildcard: "" });
  });

  it("keeps malformed percent-encoding as the raw segment instead of throwing", () => {
    window.history.replaceState(null, "", "/model/aa/%E0%A4%A");
    const { result } = renderHook(() => useParams<{ source: string; wildcard: string }>("/model/:source/*"));
    expect(result.current).toEqual({ source: "aa", wildcard: "%E0%A4%A" });
    window.history.replaceState(null, "", "/");
  });
});

const ONE_MINUTE_MS = 60_000;
const PARTIAL_PAYLOAD = { data: [], fetchedAt: "2026-01-01T00:00:00Z", partial: true };
const COMPLETE_PAYLOAD = { data: [], fetchedAt: "2026-01-01T00:00:00Z" };

interface QueryLike {
  state: { data?: unknown; dataUpdateCount: number; errorUpdateCount: number };
}

function partialQuery(): QueryLike {
  return { state: { data: PARTIAL_PAYLOAD, dataUpdateCount: 1, errorUpdateCount: 0 } };
}

const interval = (query: QueryLike): number | false => partialPollInterval(query, isPartialPayload, ONE_MINUTE_MS);

function poll(query: QueryLike): number | false {
  query.state.dataUpdateCount += 1;
  return interval(query);
}

describe("partialPollInterval", () => {
  it("polls a partial payload up to the cap, then stops for good", () => {
    const query = partialQuery();
    // The payload that opened the streak is not itself a poll.
    expect(interval(query)).toBe(ONE_MINUTE_MS);

    for (let polled = 1; polled < MAX_PARTIAL_POLLS; polled++) expect(poll(query)).toBe(ONE_MINUTE_MS);
    expect(poll(query)).toBe(false);
    expect(poll(query)).toBe(false);
  });

  it("resets the streak on a complete payload, so a later degradation polls again", () => {
    const query = partialQuery();
    expect(interval(query)).toBe(ONE_MINUTE_MS);
    for (let polled = 0; polled <= MAX_PARTIAL_POLLS; polled++) poll(query);
    expect(interval(query)).toBe(false);

    query.state.data = COMPLETE_PAYLOAD;
    query.state.dataUpdateCount += 1;
    expect(interval(query)).toBe(false);

    query.state.data = PARTIAL_PAYLOAD;
    query.state.dataUpdateCount += 1;
    expect(interval(query)).toBe(ONE_MINUTE_MS);
  });

  it("keeps a streak per query, so one capped query cannot silence another", () => {
    const capped = partialQuery();
    const fresh = partialQuery();
    expect(interval(capped)).toBe(ONE_MINUTE_MS);
    for (let polled = 0; polled <= MAX_PARTIAL_POLLS; polled++) poll(capped);
    expect(interval(capped)).toBe(false);
    expect(interval(fresh)).toBe(ONE_MINUTE_MS);
  });
});

function StatefulChild() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount((c) => c + 1)}>{count}</button>;
}

describe("SuspenseQuery reset key", () => {
  it("keeps subtree state across query-param changes but not across route changes", async () => {
    await goto("/models?tab=modelRankings");
    render(
      <Providers>
        <SuspenseQuery>
          <StatefulChild />
        </SuspenseQuery>
      </Providers>,
    );
    const button = screen.getByRole("button");
    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.getByRole("button")).toHaveTextContent("2");

    await goto("/models?tab=modelRankings&view=pricing");
    expect(screen.getByRole("button")).toHaveTextContent("2");

    await goto("/compare");
    expect(screen.getByRole("button")).toHaveTextContent("0");
  });
});

const LIGHT = "#ffffff";
const DARK = "#000000";

function installThemeColorMetas() {
  document.head.innerHTML = [
    `<meta name="theme-color" media="(prefers-color-scheme: light)" content="${LIGHT}" />`,
    `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${DARK}" />`,
  ].join("");
}

function metaContents(): (string | null)[] {
  return [...document.querySelectorAll("meta[name='theme-color']")].map((m) => m.getAttribute("content"));
}

describe("AppShell theme-color", () => {
  // jsdom has no Element.scrollTo, which AppShell calls on every route change.
  beforeAll(() => {
    Element.prototype.scrollTo = () => {};
  });

  it("writes the resolved colour into every theme-color tag, not just the first", async () => {
    installThemeColorMetas();
    useSettingsStore.setState({ themeMode: "light" });
    render(
      <Providers>
        <AppShell>
          <div />
        </AppShell>
      </Providers>,
    );
    await waitFor(() => expect(metaContents()).toEqual([LIGHT, LIGHT]));

    useSettingsStore.setState({ themeMode: "dark" });
    await waitFor(() => expect(metaContents()).toEqual([DARK, DARK]));
  });
});

function rankingModel(id: string): ArtificialAnalysisModel {
  return makeModel({ id, slug: id, name: id });
}

function setRankings(over: Partial<(typeof mocks.rankings)["value"]>) {
  mocks.rankings.value = { data: [], isPending: false, isError: false, refetch: () => {}, ...over };
}

function renderCompareLayout() {
  render(
    <Providers>
      <ComparePageLayout backTo="/models" title={t("modelComparison")}>
        {() => <div />}
      </ComparePageLayout>
    </Providers>,
  );
}

describe("ComparePageLayout stale selection", () => {
  beforeEach(() => {
    useSettingsStore.setState({ lang: "en" });
    useCompareStore.setState({ compareIds: [], lastExceedAt: null });
  });

  it("drops stored ids the loaded list no longer contains", async () => {
    useCompareStore.setState({ compareIds: ["gone", "kept"] });
    setRankings({ data: [rankingModel("kept"), rankingModel("other")] });
    renderCompareLayout();
    await waitFor(() => expect(useCompareStore.getState().compareIds).toEqual(["kept"]));
  });

  it("keeps the selection while the list is still loading", async () => {
    useCompareStore.setState({ compareIds: ["gone"] });
    setRankings({ isPending: true });
    renderCompareLayout();
    await waitFor(() => expect(useCompareStore.getState().compareIds).toEqual(["gone"]));
  });

  it("keeps the selection when the list request failed", async () => {
    useCompareStore.setState({ compareIds: ["gone"] });
    setRankings({ isError: true });
    renderCompareLayout();
    await waitFor(() => expect(useCompareStore.getState().compareIds).toEqual(["gone"]));
  });
});

const detailModel: ArtificialAnalysisModel = { id: "m1", slug: "m1", name: "Model One", intelligence_index: 50 };
const renderDetailRow = ({ model: m }: { model: ArtificialAnalysisModel }) => <div>{m.name}</div>;
const detailTitle = (m: ArtificialAnalysisModel) => m.name;

const PartialDetail = createDetailView<ArtificialAnalysisModel>(
  () => ({ data: [detailModel], partial: true }),
  "aa",
  renderDetailRow,
  detailTitle,
  "id",
);

const CompleteDetail = createDetailView<ArtificialAnalysisModel>(
  () => ({ data: [detailModel] }),
  "aa",
  renderDetailRow,
  detailTitle,
  "id",
);

function renderDetail(Detail: ReturnType<typeof createDetailView<ArtificialAnalysisModel>>) {
  render(
    <Providers>
      <Detail decodedId="m1" />
    </Providers>,
  );
}

describe("createDetailView partial notice", () => {
  beforeEach(() => useSettingsStore.setState({ lang: "en" }));

  it("surfaces the notice when the payload is partial", () => {
    renderDetail(PartialDetail);
    expect(screen.getByRole("status").textContent).toBe(t("partialDataNotice"));
  });

  it("stays quiet on a complete payload", () => {
    renderDetail(CompleteDetail);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

function openRouterPayload(partial: boolean): OpenRouterRankingsPayload {
  return {
    tokenUsageRankings: [
      {
        rank: 1,
        id: "openai/gpt-5",
        name: "GPT 5",
        creator: "OpenAI",
        category: "general",
        totalTokens: 30,
        promptTokens: 20,
        completionTokens: 10,
        requestCount: 2,
      },
    ],
    fetchedAt: "2026-09-01T00:00:00.000Z",
    ...(partial ? { partial: true } : {}),
  };
}

function renderRankingsView(data: OpenRouterRankingsPayload) {
  render(
    <Providers>
      <OpenRouterRankingsView data={data} />
    </Providers>,
  );
}

describe("OpenRouterRankingsView partial notice", () => {
  beforeEach(() => useSettingsStore.setState({ lang: "en" }));

  it("warns when the rankings shipped without prices", () => {
    renderRankingsView(openRouterPayload(true));
    expect(screen.getByText(t("partialDataNotice"))).toBeTruthy();
  });

  it("stays quiet on a complete payload", () => {
    renderRankingsView(openRouterPayload(false));
    expect(screen.queryByText(t("partialDataNotice"))).toBeNull();
  });
});

function renderSearchInput() {
  render(
    <Providers>
      <SearchInput />
    </Providers>,
  );
  return screen.getByRole("combobox");
}

describe("SearchInput dropdown states", () => {
  beforeEach(() => {
    useSettingsStore.setState({ lang: "en" });
    useSearchStore.setState({ searchTerm: "" });
  });

  it("stays shut when the trimmed query is still below the minimum", () => {
    const input = renderSearchInput();
    fireEvent.change(input, { target: { value: "a " } });
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

describe("SearchInput result selection", () => {
  beforeEach(() => {
    useSettingsStore.setState({ lang: "en" });
    useSearchStore.setState({ searchTerm: "" });
    mocks.search.value = {
      results: [
        {
          id: "gpt-5",
          name: "GPT 5",
          source: "modelRankings",
          score: 80,
          provider: "OpenAI",
          link: "/model/aa/gpt-5",
        },
      ],
      isPending: false,
      isError: false,
    };
  });

  it("navigates to the model page on click, even when the browser moves focus off the input first", () => {
    const input = renderSearchInput();
    fireEvent.change(input, { target: { value: "gpt" } });
    const option = screen.getByRole("option");

    // A row is not focusable, so a real browser's mousedown default action blurs
    // the input (focusing the body) unless the handler prevented it; the focusin
    // listener in useClickOutside then closes the list and unmounts the row before
    // its click is delivered. Model that default action here: it must be prevented.
    const mousedown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    option.dispatchEvent(mousedown);
    if (!mousedown.defaultPrevented) {
      input.blur();
      fireEvent.focusIn(document.body);
    }
    fireEvent.click(option);

    expect(window.location.pathname).toBe("/model/aa/gpt-5");
  });
});

describe("search hit ranking", () => {
  const hit = (source: SearchResult["source"], name: string, score: number | null, match = 4) => ({
    match,
    result: { id: name, name, source, score, provider: null, link: `/model/${source}/${name}` },
  });

  it("keeps the primary corpus when one model lives in several, whatever the scores are", () => {
    // Live case: GPT-6 Luna scores 40.9 on the intelligence index but 65 on the
    // omniscience index, and 65 > 40.9 used to hand the (deduped) hit — and with
    // it the detail route, its back label and destination — to the hall corpus.
    const ranked = rankSearchHits([
      hit("hallucinationRankings", "GPT-6 Luna", 65),
      hit("modelRankings", "GPT-6 Luna", 40.9),
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.source).toBe("modelRankings");
  });

  it("orders equal matches by corpus first, then by that corpus's own score", () => {
    const ranked = rankSearchHits([
      hit("hallucinationRankings", "A", 90),
      hit("modelRankings", "B", 10),
      hit("modelRankings", "C", 50),
      hit("openRouterRankings", "D", null),
    ]);
    expect(ranked.map((r) => r.name)).toEqual(["C", "B", "D", "A"]);
  });

  it("prefers a stronger match over corpus priority", () => {
    const ranked = rankSearchHits([
      hit("modelRankings", "A", 10, 2),
      hit("hallucinationRankings", "B", 90, 4),
    ]);
    expect(ranked.map((r) => r.name)).toEqual(["B", "A"]);
  });
});

describe("BackButton label and destination", () => {
  beforeEach(() => useSettingsStore.setState({ lang: "en" }));

  const list = "/models?tab=modelRankings";

  /** Renders the button, reads its wording, clicks it and reports where it landed. */
  async function clickBack(to: string, labelKey: TranslationKey = "backToModelRankings") {
    render(
      <Providers>
        <BackButton labelKey={labelKey} to={to} />
      </Providers>,
    );
    const label = screen.getByRole("button").textContent?.trim() ?? "";
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    return { label, landed: `${window.location.pathname}${window.location.search}` };
  }

  it("names the list and steps back into it when the model was opened from that list", async () => {
    window.history.replaceState(null, "", "/");
    navigate(list);
    navigate("/model/aa/claude-opus-5-5");
    const { label, landed } = await clickBack(list);
    expect(label).toBe(t("backToModelRankings"));
    expect(landed).toBe(list);
    // back() consumed the detail entry instead of replacing it, so forward still works.
    await act(async () => {
      window.history.forward();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(window.location.pathname).toBe("/model/aa/claude-opus-5-5");
  });

  it("reads as a plain Back and returns the reader where they came from otherwise", async () => {
    window.history.replaceState(null, "", "/");
    navigate("/models?tab=hallucinationRankings");
    navigate("/model/aa/claude-opus-5-5");
    // Arrived from a search hit on another tab: the label must not promise the
    // model rankings, and going back is what a plain "Back" means.
    const { label, landed } = await clickBack(list);
    expect(label).toBe(t("back"));
    expect(landed).toBe("/models?tab=hallucinationRankings");
  });

  it("names the list on a direct landing and goes there", async () => {
    window.history.replaceState(null, "", "/model/aa/claude-opus-5-5");
    const { label, landed } = await clickBack(list);
    expect(label).toBe(t("backToModelRankings"));
    expect(landed).toBe(list);
  });

  it("keeps the compare page's wording generic even from that list", async () => {
    window.history.replaceState(null, "", "/");
    navigate("/models?tab=modelRankings");
    navigate("/compare");
    const { label, landed } = await clickBack(list, "back");
    expect(label).toBe(t("back"));
    expect(landed).toBe("/models?tab=modelRankings");
  });
});

describe("SearchInput corpus warming", () => {
  beforeEach(() => {
    useSettingsStore.setState({ lang: "en" });
    useSearchStore.setState({ searchTerm: "" });
  });

  it("leaves the corpus queries suspended while the box is untouched and unfocused", () => {
    renderSearchInput();
    expect(mocks.search.calls.length).toBeGreaterThan(0);
    expect(mocks.search.calls.every((call) => call.suspended && !call.warm)).toBe(true);
  });

  it("warms the corpus on focus without opening the dropdown", () => {
    const input = renderSearchInput();
    fireEvent.focus(input);
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(mocks.search.calls.at(-1)).toMatchObject({ warm: true });
  });
});

function settingsEvent(state: Record<string, unknown>, key: string = STORAGE_KEYS.settings): StorageEvent {
  return new StorageEvent("storage", { key, newValue: JSON.stringify({ state, version: 1 }) });
}

describe("settings cross-tab sync", () => {
  beforeEach(() => {
    useSettingsStore.setState({ themeMode: "light", lang: "zh" });
  });

  it("adopts the theme and language written by another tab", () => {
    syncSettingsFromStorageEvent(settingsEvent({ themeMode: "dark", lang: "en" }));
    expect(useSettingsStore.getState()).toMatchObject({ themeMode: "dark", lang: "en" });
  });

  it("ignores other keys, removals, malformed payloads and unknown values", () => {
    syncSettingsFromStorageEvent(settingsEvent({ themeMode: "dark" }, "modeltide-other"));
    syncSettingsFromStorageEvent(new StorageEvent("storage", { key: STORAGE_KEYS.settings, newValue: null }));
    syncSettingsFromStorageEvent(new StorageEvent("storage", { key: STORAGE_KEYS.settings, newValue: "{not json" }));
    syncSettingsFromStorageEvent(settingsEvent({ themeMode: "sepia", lang: "fr" }));

    expect(useSettingsStore.getState()).toMatchObject({ themeMode: "light", lang: "zh" });
  });
});
