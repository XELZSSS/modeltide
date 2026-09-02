import { useMemo } from "react";
import { SearchableDataTable, DataTable, RightAlignedText, type DataTableColumn } from "@/client/components/data";
import { useTranslation } from "@/client/providers";
import type { TranslationKey } from "@/shared/i18n";
import { formatDate, shortModelId } from "@/client/utils";
import { useSuspenseOpenSourceReleases, useSuspenseArtificialRankings } from "@/client/api/queries";
import { SuspenseQuery } from "@/client/components/shared";
import { SearchInput } from "@/client/search";
import { TabbedPage } from "@/client/components/layout";
import { useUrlTab } from "@/client/hooks";
import { type TabItem } from "@/client/components/ui";
import type { OpenSourceModelEntry, ArtificialAnalysisModel } from "@/shared/types";

type FeedEntryType = "update" | "opensource";

interface FeedEntry {
  id: string;
  name: string;
  date: string;
  ts: number;
  type: FeedEntryType;
  source: "huggingface" | "artificial";
}

interface DatedModel {
  model: ArtificialAnalysisModel;
  ts: number;
}

function parseTs(value: string): number | null {
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function toDateStr(ts: number): string {
  return new Date(ts).toISOString().split("T")[0]!;
}

function useReleaseFeedEntries(openSourceReleases: OpenSourceModelEntry[]): FeedEntry[] {
  return useMemo(() => {
    const seen = new Map<string, FeedEntry>();
    const add = (id: string, name: string, ts: number, type: FeedEntry["type"]) => {
      const key = `${id}|${type}|${ts}`;
      if (!seen.has(key)) seen.set(key, { id, name, date: toDateStr(ts), ts, type, source: "huggingface" });
    };
    for (const m of openSourceReleases) {
      const name = shortModelId(m.id);
      if (m.createdAt) {
        const ts = parseTs(m.createdAt);
        if (ts != null) add(m.id, name, ts, "opensource");
      }
      if (m.lastModified && m.lastModified !== m.createdAt) {
        const ts = parseTs(m.lastModified);
        if (ts != null) add(`${m.id}_mod`, name, ts, "update");
      }
    }
    return Array.from(seen.values()).sort((a, b) => b.ts - a.ts);
  }, [openSourceReleases]);
}

function useReleaseDateRows(artificialRankings: ArtificialAnalysisModel[]): DatedModel[] {
  return useMemo(
    () =>
      artificialRankings
        .map((model) => {
          const ts = model.release_date ? parseTs(`${model.release_date}T00:00:00Z`) : null;
          return ts == null ? null : { model, ts };
        })
        .filter((x): x is DatedModel => x != null)
        .sort((a, b) => b.ts - a.ts),
    [artificialRankings],
  );
}

const getFeedSearchFields = (e: FeedEntry) => [e.name, e.id];
const getFeedRowId = (e: FeedEntry) => e.id;

function FeedTab({ allEntries }: { allEntries: FeedEntry[] }) {
  const { t, lang } = useTranslation();

  const feedColumns = useMemo<DataTableColumn<FeedEntry>[]>(() => {
    const TYPE_LABEL: Record<FeedEntryType, TranslationKey> = {
      update: "releaseUpdate",
      opensource: "releaseOpenSource",
    };
    return [
      {
        id: "model",
        header: t("model"),
        cell: (row) => (
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{row.name}</p>
            <div className="flex md:hidden mt-1 items-center gap-1.5">
              <span className="text-xs font-semibold text-text-secondary">{t(TYPE_LABEL[row.type])}</span>
              <span className="text-xs text-text-tertiary">{formatDate(row.ts, lang)}</span>
            </div>
          </div>
        ),
      },
      {
        id: "date",
        header: t("releaseDate"),
        align: "right",
        width: 100,
        hiddenMd: true,
        cell: (row) => <span className="text-xs">{formatDate(row.ts, lang)}</span>,
      },
      {
        id: "type",
        header: t("releaseType"),
        align: "right",
        width: 140,
        hiddenMd: true,
        cell: (row) => <span className="text-xs font-semibold text-text-secondary">{t(TYPE_LABEL[row.type])}</span>,
      },
    ];
  }, [t, lang]);

  return <SearchableDataTable data={allEntries} columns={feedColumns} getRowId={getFeedRowId} getSearchFields={getFeedSearchFields} />;
}

function ReleaseDatesTab({ releaseRows }: { releaseRows: DatedModel[] }) {
  const { t, lang } = useTranslation();
  const releaseColumns = useMemo<DataTableColumn<DatedModel>[]>(
    () => [
      {
        id: "model",
        header: t("model"),
        cell: (row) => (
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{row.model.name}</p>
            <div className="flex md:hidden mt-1 items-center gap-1.5">
              {row.model.model_creators?.name && (
                <span className="text-xs text-text-secondary">{row.model.model_creators.name}</span>
              )}
              <span className="text-xs text-text-tertiary">{formatDate(row.ts, lang)}</span>
            </div>
          </div>
        ),
      },
      {
        id: "creator",
        header: t("creator"),
        align: "right",
        width: "24%",
        hiddenMd: true,
        cell: (row) => <RightAlignedText>{row.model.model_creators?.name || t("notAvailable")}</RightAlignedText>,
      },
      {
        id: "releaseDate",
        header: t("releaseDate"),
        align: "right",
        width: "18%",
        hiddenMd: true,
        cell: (row) => <span className="text-sm">{formatDate(row.ts, lang)}</span>,
      },
    ],
    [t, lang],
  );

  return <DataTable data={releaseRows} columns={releaseColumns} />;
}

const TAB_IDS = ["feed", "release-dates"] as const;

function ReleasesContent() {
  const { t } = useTranslation();
  const [mode, setMode] = useUrlTab(TAB_IDS, TAB_IDS[0]);
  const { data: openSourceReleases } = useSuspenseOpenSourceReleases();
  const { data: artificialRankings } = useSuspenseArtificialRankings();

  const allEntries = useReleaseFeedEntries(openSourceReleases);
  const releaseRows = useReleaseDateRows(artificialRankings);

  const tabs: TabItem[] = useMemo(
    () => [
      { id: "feed", label: t("releaseOpenSource") },
      { id: "release-dates", label: t("releaseModel") },
    ],
    [t],
  );

  const countLabel =
    mode === "feed" ? t("events", { count: allEntries.length }) : t("modelsTotal", { count: releaseRows.length });
  const description = mode === "feed" ? t("releaseDataSource") : t("artificialSource");

  return (
    <TabbedPage
      title={t("releases")}
      description={description}
      actions={<SearchInput />}
      countLabel={countLabel}
      tabs={tabs}
      activeTab={mode}
      onTabChange={setMode}
    >
      {mode === "feed" ? <FeedTab allEntries={allEntries} /> : <ReleaseDatesTab releaseRows={releaseRows} />}
    </TabbedPage>
  );
}

/** Release activity view: an open-source event feed and a release-date table. */
export function ReleasesView() {
  return (
    <SuspenseQuery>
      <ReleasesContent />
    </SuspenseQuery>
  );
}
