import { useCallback, useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { RightAlignedText, col, rightCol, type DataTableColumn } from "@/client/components/data/table/table-columns";
import { SearchableDataTable } from "@/client/components/data/table";
import { useTranslation } from "@/client/providers";
import { formatDate, safeHref } from "@/client/utils/format";
import { useSuspenseClosedReleasesState, useSuspenseOpenSourceReleases } from "@/client/api/api-queries";
import { PartialNotice } from "@/client/components/feedback";
import { SuspenseQuery } from "@/client/router/suspense-query";
import { SearchInput } from "@/client/search/search-input";
import { PageContainer, PageHeader } from "@/client/components/layout";
import {
  buildReleaseRows,
  getReleaseRowId,
  getReleaseSearchFields,
  type ReleaseRow,
} from "@/client/utils/release-feed";

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

function ReleasesContent() {
  const { t, lang } = useTranslation();
  const openSourceReleases = useSuspenseOpenSourceReleases();
  const { items: closedReleases, partial } = useSuspenseClosedReleasesState();

  const rows = useMemo(
    () => buildReleaseRows(openSourceReleases, closedReleases),
    [openSourceReleases, closedReleases],
  );

  const columns = useMemo<DataTableColumn<ReleaseRow>[]>(
    () => [
      col("model", t("model"), (row) => (
        <ReleaseModelCell
          title={row.name}
          name={row.name}
          semibold
          line={
            <>
              <span className="text-xs text-text-secondary">{row.provider}</span>
              <span className="ui-meta">{formatDate(row.date, lang)}</span>
            </>
          }
        />
      )),
      rightCol(
        "provider",
        t("provider"),
        (row) => <RightAlignedText className="text-sm">{row.provider}</RightAlignedText>,
        {
          width: "24%",
          hiddenMd: true,
        },
      ),
      rightCol(
        "releaseDate",
        t("releaseDate"),
        (row) => <span className="ui-mono-value font-normal">{formatDate(row.date, lang)}</span>,
        { width: "18%", hiddenMd: true },
      ),
    ],
    [t, lang],
  );

  // Stable across renders: `SearchableDataTable` is memoized, so a fresh callback re-renders every row.
  const renderExpanded = useCallback(
    (row: ReleaseRow) => {
      const href = safeHref(row.link);
      if (!href) return null;
      return (
        <div className="flex flex-col gap-3 p-4 sm:p-5">
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1.5 text-sm text-accent w-fit underline-offset-4 transition-colors duration-fast hoverable:hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            {t(row.id.startsWith("aa:") ? "aaModelPage" : "hfModelPage")}
            <ExternalLink
              size={14}
              className="md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-fast"
            />
          </a>
        </div>
      );
    },
    [t],
  );

  return (
    <PageContainer>
      <PageHeader title={t("releases")} description={t("releaseDataSources")} actions={<SearchInput />} />
      <div className="flex items-center gap-2 -mt-2 mb-4">
        <span className="ui-meta tabular-nums">{t("events", { count: rows.length })}</span>
      </div>
      {partial && <PartialNotice />}
      <SearchableDataTable
        data={rows}
        columns={columns}
        getRowId={getReleaseRowId}
        getRowName={(row) => row.name}
        getSearchFields={getReleaseSearchFields}
        renderExpandedRow={renderExpanded}
      />
    </PageContainer>
  );
}

export function ReleasesView() {
  return (
    <SuspenseQuery resetKey="releases">
      <ReleasesContent />
    </SuspenseQuery>
  );
}
