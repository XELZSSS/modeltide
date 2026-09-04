import { useMemo, useState } from "react";
import { useTranslation } from "@/client/providers";
import { SearchableDataTable, indexRankMap, rankCol, type DataTableColumn } from "@/client/components/data";
import { Badge, SegmentedGroup, TabButton } from "@/client/components/ui";
import { formatIndex, formatShortNumber, formatPercent, formatPricePerMillion, shortModelId } from "@/client/utils";
import { useSuspenseArenaBoard, useSuspenseArenaRankings } from "@/client/api/queries";
import { ARENA_BOARD_CATEGORIES, ARENA_BOARD_IDS, type ArenaBoardKey } from "@/shared/config";
import type { ArenaRankEntry, HallucinationRankingEntry, OpenSourceModelEntry } from "@/shared/types";

export const RANKING_TABS = [
  "modelRankings",
  "openRouterRankings",
  "openSourceRankings",
  "hallucinationRankings",
  "benchmarkRankings",
  "arenaRankings",
  "providerCompare",
] as const;

export type RankingTabId = (typeof RANKING_TABS)[number];

function buildOpenSourceColumns(t: ReturnType<typeof useTranslation>["t"]): DataTableColumn<OpenSourceModelEntry>[] {
  return [
    {
      id: "model",
      header: t("model"),
      width: "40%",
      cell: (item) => (
        <p className="text-sm font-medium truncate" title={item.id}>
          {shortModelId(item.id)}
        </p>
      ),
    },
    {
      id: "downloads",
      header: t("downloads"),
      align: "right",
      cell: (item) => <span className="text-sm font-semibold">{formatShortNumber(item.downloads)}</span>,
    },
    {
      id: "likes",
      header: t("likes"),
      align: "right",
      hiddenMd: true,
      cell: (item) => <span className="text-sm">{formatShortNumber(item.likes)}</span>,
    },
    {
      id: "license",
      header: t("license"),
      align: "right",
      hiddenMd: true,
      cell: (item) => <span className="text-sm">{item.license || t("notAvailable")}</span>,
    },
  ];
}

const getOpenSourceRowId = (model: OpenSourceModelEntry) => model.id;
const getOpenSourceSearchFields = (model: OpenSourceModelEntry) => [model.id];

/** Open-source model table ranked by downloads, with search. */
export function OpenSourceRankingsView({ rankings }: { rankings: OpenSourceModelEntry[] }) {
  const { t } = useTranslation();
  const rankMap = useMemo(() => indexRankMap(rankings, getOpenSourceRowId), [rankings]);
  const columns = useMemo(
    () => [
      rankCol((m: OpenSourceModelEntry) => rankMap.get(getOpenSourceRowId(m)) ?? null),
      ...buildOpenSourceColumns(t),
    ],
    [t, rankMap],
  );
  return (
    <SearchableDataTable
      data={rankings}
      columns={columns}
      getRowId={getOpenSourceRowId}
      getSearchFields={getOpenSourceSearchFields}
    />
  );
}

function buildHallColumns(t: ReturnType<typeof useTranslation>["t"]): DataTableColumn<HallucinationRankingEntry>[] {
  return [
    {
      id: "model",
      header: t("model"),
      width: "40%",
      cell: (item) => (
        <p className="text-sm font-medium truncate" title={item.model}>
          {item.model}
        </p>
      ),
    },
    {
      id: "hallucinationRate",
      header: t("hallucinationRate"),
      align: "right",
      cell: (item) => <span className="text-sm font-semibold">{formatPercent(t, item.hallucinationRate)}</span>,
    },
    {
      id: "accuracy",
      header: t("accuracy"),
      align: "right",
      hiddenMd: true,
      cell: (item) => <span className="text-sm">{formatPercent(t, item.accuracy)}</span>,
    },
    {
      id: "attemptRate",
      header: t("attemptRate"),
      align: "right",
      hiddenMd: true,
      cell: (item) => <span className="text-sm">{formatPercent(t, item.attemptRate)}</span>,
    },
    {
      id: "omniscienceIndex",
      header: t("omniscienceIndex"),
      align: "right",
      hiddenMd: true,
      cell: (item) => <span className="text-sm">{formatIndex(item.omniscienceIndex)}</span>,
    },
  ];
}

const getHallRowId = (entry: HallucinationRankingEntry) => entry.id || entry.slug || entry.model;
const getHallSearchFields = (entry: HallucinationRankingEntry) => [entry.model];

/** Hallucination benchmark table. */
export function HallucinationRankingsView({ rankings }: { rankings: HallucinationRankingEntry[] }) {
  const { t } = useTranslation();
  const rankMap = useMemo(() => indexRankMap(rankings, getHallRowId), [rankings]);
  const columns = useMemo(
    () => [rankCol((e: HallucinationRankingEntry) => rankMap.get(getHallRowId(e)) ?? null), ...buildHallColumns(t)],
    [t, rankMap],
  );
  return (
    <SearchableDataTable
      data={rankings}
      columns={columns}
      getRowId={getHallRowId}
      getSearchFields={getHallSearchFields}
    />
  );
}

/** Arena capability slice (coding / math / ...) — same table as the overall Arena tab. */
export function BenchmarkBoardView() {
  const { t } = useTranslation();
  const [category, setCategory] = useState<ArenaBoardKey>(ARENA_BOARD_IDS[0] ?? "coding");
  const { data } = useSuspenseArenaBoard(category);
  const columns = useMemo(() => buildArenaColumns(t), [t]);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
        <SegmentedGroup className="overflow-x-auto no-scrollbar" role="radiogroup" aria-label={t("benchmarkRankings")}>
          {ARENA_BOARD_IDS.map((id) => (
            <TabButton key={id} role="radio" active={category === id} onClick={() => setCategory(id)}>
              {t(ARENA_BOARD_CATEGORIES[id].labelKey)}
            </TabButton>
          ))}
        </SegmentedGroup>
      </div>
      <SearchableDataTable
        data={data.entries}
        columns={columns}
        getRowId={getArenaRowId}
        getSearchFields={getArenaSearchFields}
      />
    </div>
  );
}

function buildArenaColumns(t: ReturnType<typeof useTranslation>["t"]): DataTableColumn<ArenaRankEntry>[] {
  return [
    rankCol((item) => item.rank),
    {
      id: "model",
      header: t("model"),
      width: "40%",
      cell: (item) => (
        <p className="text-sm font-medium truncate" title={item.name}>
          {item.name}
          {item.preliminary && (
            <Badge className="ml-1.5 align-middle text-warning border-warning/40">{t("preliminary")}</Badge>
          )}
        </p>
      ),
    },
    {
      id: "score",
      header: t("score"),
      align: "right",
      cell: (item) => (
        <span className="text-sm font-semibold font-mono">
          {item.score != null ? Math.round(item.score).toLocaleString("en-US") : t("notAvailable")}
        </span>
      ),
    },
    {
      id: "votes",
      header: t("votes"),
      align: "right",
      hiddenMd: true,
      cell: (item) => (
        <span className="text-sm">{item.votes != null ? formatShortNumber(item.votes) : t("notAvailable")}</span>
      ),
    },
    {
      id: "price",
      header: t("pricing"),
      align: "right",
      hiddenMd: true,
      cell: (item) => (
        <span className="text-sm">
          {item.priceInput != null && item.priceOutput != null
            ? formatPricePerMillion(item.priceInput, t)
            : t("notAvailable")}
        </span>
      ),
    },
  ];
}

const getArenaRowId = (entry: ArenaRankEntry) => `${entry.rank}|${entry.id}`;
const getArenaSearchFields = (entry: ArenaRankEntry) => [entry.name, entry.id, entry.creator];

/** Arena human-preference leaderboard table. */
export function ArenaRankingsView() {
  const { t } = useTranslation();
  const { data } = useSuspenseArenaRankings();
  const columns = useMemo(() => buildArenaColumns(t), [t]);
  return (
    <SearchableDataTable
      data={data.entries}
      columns={columns}
      getRowId={getArenaRowId}
      getSearchFields={getArenaSearchFields}
    />
  );
}
