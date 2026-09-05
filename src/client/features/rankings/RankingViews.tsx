import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "@/client/providers";
import { SearchableDataTable, indexRankMap, rankCol, type DataTableColumn } from "@/client/components/data";
import { SuspenseQuery } from "@/client/components/shared";
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

/** First column shared by the ranking tables: truncated model name. */
function modelNameCol<T>(
  header: string,
  titleOf: (row: T) => string,
  textOf: (row: T) => ReactNode,
): DataTableColumn<T> {
  return {
    id: "model",
    header,
    width: "40%",
    cell: (row) => (
      <p className="text-sm font-medium truncate" title={titleOf(row)}>
        {textOf(row)}
      </p>
    ),
  };
}

/** Ranked table: stable global-rank column + caller columns + search. */
function RankedTableView<T>({
  rows,
  getRowId,
  getSearchFields,
  buildBodyColumns,
}: {
  rows: T[];
  getRowId: (row: T) => string;
  getSearchFields: (row: T) => (string | null | undefined)[];
  buildBodyColumns: (t: ReturnType<typeof useTranslation>["t"]) => DataTableColumn<T>[];
}) {
  const { t } = useTranslation();
  const rankMap = useMemo(() => indexRankMap(rows, getRowId), [rows, getRowId]);
  const columns = useMemo<DataTableColumn<T>[]>(
    () => [rankCol((r: T) => rankMap.get(getRowId(r)) ?? null), ...buildBodyColumns(t)],
    [t, rankMap, getRowId, buildBodyColumns],
  );
  return <SearchableDataTable data={rows} columns={columns} getRowId={getRowId} getSearchFields={getSearchFields} />;
}

function buildOpenSourceColumns(t: ReturnType<typeof useTranslation>["t"]): DataTableColumn<OpenSourceModelEntry>[] {
  return [
    modelNameCol(
      t("model"),
      (item) => item.id,
      (item) => shortModelId(item.id),
    ),
    {
      id: "downloads",
      header: t("downloads"),
      align: "right",
      cell: (item) => <span className="ui-mono-value font-semibold">{formatShortNumber(item.downloads)}</span>,
    },
    {
      id: "likes",
      header: t("likes"),
      align: "right",
      hiddenMd: true,
      cell: (item) => <span className="ui-mono-value font-normal">{formatShortNumber(item.likes)}</span>,
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
  return (
    <RankedTableView
      rows={rankings}
      getRowId={getOpenSourceRowId}
      getSearchFields={getOpenSourceSearchFields}
      buildBodyColumns={buildOpenSourceColumns}
    />
  );
}

function buildHallColumns(t: ReturnType<typeof useTranslation>["t"]): DataTableColumn<HallucinationRankingEntry>[] {
  return [
    modelNameCol(
      t("model"),
      (item) => item.model,
      (item) => item.model,
    ),
    {
      id: "hallucinationRate",
      header: t("hallucinationRate"),
      align: "right",
      cell: (item) => <span className="ui-mono-value font-semibold">{formatPercent(t, item.hallucinationRate)}</span>,
    },
    {
      id: "accuracy",
      header: t("accuracy"),
      align: "right",
      hiddenMd: true,
      cell: (item) => <span className="ui-mono-value font-normal">{formatPercent(t, item.accuracy)}</span>,
    },
    {
      id: "attemptRate",
      header: t("attemptRate"),
      align: "right",
      hiddenMd: true,
      cell: (item) => <span className="ui-mono-value font-normal">{formatPercent(t, item.attemptRate)}</span>,
    },
    {
      id: "omniscienceIndex",
      header: t("omniscienceIndex"),
      align: "right",
      hiddenMd: true,
      cell: (item) => <span className="ui-mono-value font-normal">{formatIndex(item.omniscienceIndex)}</span>,
    },
  ];
}

const getHallRowId = (entry: HallucinationRankingEntry) => entry.id || entry.slug || entry.model;
const getHallSearchFields = (entry: HallucinationRankingEntry) => [entry.model];

/** Hallucination benchmark table. */
export function HallucinationRankingsView({ rankings }: { rankings: HallucinationRankingEntry[] }) {
  return (
    <RankedTableView
      rows={rankings}
      getRowId={getHallRowId}
      getSearchFields={getHallSearchFields}
      buildBodyColumns={buildHallColumns}
    />
  );
}

/** Arena entries table shared by the capability board and the overall tab. */
function ArenaTable({ entries }: { entries: ArenaRankEntry[] }) {
  const { t } = useTranslation();
  const columns = useMemo(() => buildArenaColumns(t), [t]);
  return (
    <SearchableDataTable
      data={entries}
      columns={columns}
      getRowId={getArenaRowId}
      getSearchFields={getArenaSearchFields}
    />
  );
}

function BenchmarkBoardContent({ category }: { category: ArenaBoardKey }) {
  const { data } = useSuspenseArenaBoard(category);
  return <ArenaTable entries={data.entries} />;
}

/** Arena capability slice; same table as the overall Arena tab. */
export function BenchmarkBoardView() {
  const { t } = useTranslation();
  const [category, setCategory] = useState<ArenaBoardKey>(ARENA_BOARD_IDS[0] ?? "coding");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <SegmentedGroup className="overflow-x-auto no-scrollbar" role="radiogroup" aria-label={t("benchmarkRankings")}>
          {ARENA_BOARD_IDS.map((id) => (
            <TabButton key={id} role="radio" active={category === id} onClick={() => setCategory(id)}>
              {t(ARENA_BOARD_CATEGORIES[id].labelKey)}
            </TabButton>
          ))}
        </SegmentedGroup>
      </div>
      {/* Category switches reset failures without full-page navigation. */}
      <SuspenseQuery resetKey={category}>
        <BenchmarkBoardContent category={category} />
      </SuspenseQuery>
    </div>
  );
}

function buildArenaColumns(t: ReturnType<typeof useTranslation>["t"]): DataTableColumn<ArenaRankEntry>[] {
  return [
    rankCol((item) => item.rank),
    modelNameCol(
      t("model"),
      (item) => item.name,
      (item) => (
        <>
          {item.name}
          {item.preliminary && (
            <Badge className="ml-1.5 align-middle text-warning border-warning/40">{t("preliminary")}</Badge>
          )}
        </>
      ),
    ),
    {
      id: "score",
      header: t("score"),
      align: "right",
      cell: (item) => (
        <span className="ui-mono-value font-semibold">
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
        <span className="ui-mono-value font-normal">
          {item.votes != null ? formatShortNumber(item.votes) : t("notAvailable")}
        </span>
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
  const { data } = useSuspenseArenaRankings();
  return <ArenaTable entries={data.entries} />;
}
