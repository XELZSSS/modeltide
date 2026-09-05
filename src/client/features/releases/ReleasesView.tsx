import { useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { SearchableDataTable, RightAlignedText, type DataTableColumn } from "@/client/components/data";
import { useTranslation } from "@/client/providers";
import type { TranslationKey } from "@/shared/i18n";
import { formatDate, safeHref, shortModelId } from "@/client/utils";
import { useSuspenseClosedReleases, useSuspenseOpenSourceReleases } from "@/client/api/queries";
import { SuspenseQuery } from "@/client/components/shared";
import { SearchInput } from "@/client/search";
import { TabbedPage } from "@/client/components/layout";
import { useUrlTab } from "@/client/hooks";
import { type TabItem } from "@/client/components/ui";
import type { ClosedReleaseEntry, OpenSourceModelEntry } from "@/shared/types";

type FeedEntryType = "update" | "opensource";

interface FeedEntry {
  id: string;
  name: string;
  date: string;
  ts: number;
  type: FeedEntryType;
}

function parseTs(value: string): number | null {
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function toDateStr(ts: number): string {
  // Local calendar day, consistent with formatDate().
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function useReleaseFeedEntries(openSourceReleases: OpenSourceModelEntry[]): FeedEntry[] {
  return useMemo(() => {
    const seen = new Map<string, FeedEntry>();
    const add = (id: string, name: string, ts: number, type: FeedEntry["type"]) => {
      const key = `${id}|${type}|${ts}`;
      if (!seen.has(key)) seen.set(key, { id, name, date: toDateStr(ts), ts, type });
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
            <p className="text-sm font-medium truncate" title={row.name}>
              {row.name}
            </p>
            <div className="flex md:hidden mt-1.5 items-center gap-2">
              <span className="text-xs font-medium text-text-secondary">{t(TYPE_LABEL[row.type])}</span>
              <span className="ui-meta">{formatDate(row.ts, lang)}</span>
            </div>
          </div>
        ),
      },
      {
        id: "date",
        header: t("releaseDate"),
        align: "right",
        width: 120,
        hiddenMd: true,
        cell: (row) => <span className="ui-mono-value font-normal">{formatDate(row.ts, lang)}</span>,
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

function ClosedReleasesTab({ releases }: { releases: ClosedReleaseEntry[] }) {
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
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" title={row.entry.model}>
              {row.entry.model}
            </p>
            <div className="flex md:hidden mt-1.5 items-center gap-2">
              <span className="text-xs text-text-secondary">{row.entry.provider}</span>
              <span className="ui-meta">{formatDate(row.ts, lang)}</span>
            </div>
          </div>
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
        header: t("releaseDate"),
        align: "right",
        width: "18%",
        hiddenMd: true,
        cell: (row) => <span className="ui-mono-value font-normal">{formatDate(row.ts, lang)}</span>,
      },
    ],
    [t, lang],
  );

  const renderExpanded = (row: ClosedRow) => {
    const href = safeHref(row.entry.link);
    return (
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        {row.entry.notes && <p className="ui-body-secondary leading-relaxed">{row.entry.notes}</p>}
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
    <SearchableDataTable
      data={rows}
      columns={columns}
      getRowId={getClosedRowId}
      getSearchFields={getClosedSearchFields}
      renderExpandedRow={renderExpanded}
    />
  );
}

const TAB_IDS = ["feed", "closed"] as const;

function ReleasesContent() {
  const { t } = useTranslation();
  const [mode, setMode] = useUrlTab(TAB_IDS, TAB_IDS[0]);
  const { data: openSourceReleases } = useSuspenseOpenSourceReleases();
  const { data: closedReleases } = useSuspenseClosedReleases();

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
      {mode === "feed" ? <FeedTab allEntries={allEntries} /> : <ClosedReleasesTab releases={closedReleases} />}
    </TabbedPage>
  );
}

/** Open-source event feed + closed-source frontier board. */
export function ReleasesView() {
  return (
    <SuspenseQuery>
      <ReleasesContent />
    </SuspenseQuery>
  );
}
