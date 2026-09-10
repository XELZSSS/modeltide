"use client";
import { useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { RightAlignedText, type DataTableColumn } from "@/client/components/data/columns";
import { SearchableDataTable } from "@/client/components/data/searchable";
import { useTranslation } from "@/client/providers";
import type { TranslationKey } from "@/shared/i18n";
import { formatDate, safeHref } from "@/client/utils/format";
import { useSuspenseClosedReleasesState, useSuspenseOpenSourceReleases } from "@/client/api/queries";
import { SuspenseQuery, PartialNotice } from "@/client/components/feedback";
import { SearchInput } from "@/client/search/SearchInput";
import { TabbedPage } from "@/client/components/layout";
import { useClientTab } from "@/client/hooks/use-client-tab";
import { type TabItem } from "@/client/components/ui/tabs";
import type { ClosedReleaseEntry } from "@/shared/types";
import {
  buildReleaseFeedEntries,
  getFeedRowId,
  getFeedSearchFields,
  parseReleaseTs as parseTs,
  type FeedEntry,
  type FeedEntryType,
} from "@/client/features/releases/feed-entries";

function useReleaseFeedEntries(openSourceReleases: Parameters<typeof buildReleaseFeedEntries>[0]): FeedEntry[] {
  return useMemo(() => buildReleaseFeedEntries(openSourceReleases), [openSourceReleases]);
}

function ReleaseModelCell({
  title,
  name,
  line,
  semibold,
}: {
  title: string;
  name: string;
  line: React.ReactNode;
  semibold?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className={`text-sm truncate ${semibold ? "font-semibold" : "font-medium"}`} title={title}>
        {name}
      </p>
      <div className="flex md:hidden mt-1.5 items-center gap-2">{line}</div>
    </div>
  );
}

function releaseDateCol<T>(t: ReturnType<typeof useTranslation>["t"], lang: string, getDate: (row: T) => string) {
  return {
    header: t("releaseDate"),
    align: "right" as const,
    hiddenMd: true,
    cell: (row: T) => <span className="ui-mono-value font-normal">{formatDate(getDate(row), lang)}</span>,
  };
}

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
          <ReleaseModelCell
            title={row.name}
            name={row.name}
            line={
              <>
                <span className="text-xs font-medium text-text-secondary">{t(TYPE_LABEL[row.type])}</span>
                <span className="ui-meta">{formatDate(row.date, lang)}</span>
              </>
            }
          />
        ),
      },
      {
        id: "date",
        width: 120,
        ...releaseDateCol(t, lang, (row: FeedEntry) => row.date),
      },
      {
        id: "type",
        header: t("releaseType"),
        align: "right",
        width: 140,
        hiddenMd: true,
        cell: (row) => <span className="text-xs font-medium text-text-secondary">{t(TYPE_LABEL[row.type])}</span>,
      },
    ];
  }, [t, lang]);

  return (
    <SearchableDataTable
      data={allEntries}
      columns={feedColumns}
      getRowId={getFeedRowId}
      getSearchFields={getFeedSearchFields}
    />
  );
}

interface ClosedRow {
  entry: ClosedReleaseEntry;
  ts: number;
}

const getClosedRowId = (row: ClosedRow) => row.entry.id;
const getClosedSearchFields = (row: ClosedRow) => [row.entry.model, row.entry.provider];

function ClosedReleasesTab({ releases, partial }: { releases: ClosedReleaseEntry[]; partial: boolean }) {
  const { t, lang } = useTranslation();

  const rows = useMemo<ClosedRow[]>(
    () =>
      releases
        .map((entry) => {
          const ts = parseTs(entry.releaseDate);
          return ts == null ? null : { entry, ts };
        })
        .filter((x): x is ClosedRow => x != null)
        .sort((a, b) => b.ts - a.ts),
    [releases],
  );

  const columns = useMemo<DataTableColumn<ClosedRow>[]>(
    () => [
      {
        id: "model",
        header: t("model"),
        cell: (row) => (
          <ReleaseModelCell
            title={row.entry.model}
            name={row.entry.model}
            semibold
            line={
              <>
                <span className="text-xs text-text-secondary">{row.entry.provider}</span>
                <span className="ui-meta">{formatDate(row.entry.releaseDate, lang)}</span>
              </>
            }
          />
        ),
      },
      {
        id: "provider",
        header: t("provider"),
        align: "right",
        width: "24%",
        hiddenMd: true,
        cell: (row) => <RightAlignedText className="text-sm">{row.entry.provider}</RightAlignedText>,
      },
      {
        id: "releaseDate",
        width: "18%",
        ...releaseDateCol(t, lang, (row: ClosedRow) => row.entry.releaseDate),
      },
    ],
    [t, lang],
  );

  const renderExpanded = (row: ClosedRow) => {
    const href = safeHref(row.entry.link);
    return (
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1.5 text-sm text-accent w-fit"
          >
            {t("aaModelPage")}
            <ExternalLink size={14} className="md:opacity-0 md:group-hover:opacity-100 transition-opacity" />
          </a>
        )}
      </div>
    );
  };

  return (
    <>
      {partial && (
        <div className="mb-3">
          <PartialNotice message={t("partialDataNotice")} />
        </div>
      )}
      <SearchableDataTable
        data={rows}
        columns={columns}
        getRowId={getClosedRowId}
        getSearchFields={getClosedSearchFields}
        renderExpandedRow={renderExpanded}
      />
    </>
  );
}

const TAB_IDS = ["feed", "closed"] as const;

function ReleasesContent() {
  const { t } = useTranslation();
  const [mode, setMode] = useClientTab("tab", TAB_IDS, TAB_IDS[0]);
  const openSourceReleases = useSuspenseOpenSourceReleases();
  const { items: closedReleases, partial: closedPartial } = useSuspenseClosedReleasesState();

  const allEntries = useReleaseFeedEntries(openSourceReleases);

  const tabs: TabItem[] = useMemo(
    () => [
      { id: "feed", label: t("releaseOpenSource") },
      { id: "closed", label: t("releaseClosedSource") },
    ],
    [t],
  );

  const countLabel =
    mode === "feed" ? t("events", { count: allEntries.length }) : t("modelsTotal", { count: closedReleases.length });
  const description = mode === "feed" ? t("releaseDataSource") : t("closedReleasesSource");

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
      {mode === "feed" ? (
        <FeedTab allEntries={allEntries} />
      ) : (
        <ClosedReleasesTab releases={closedReleases} partial={closedPartial} />
      )}
    </TabbedPage>
  );
}

export function ReleasesView() {
  return (
    <SuspenseQuery>
      <ReleasesContent />
    </SuspenseQuery>
  );
}
