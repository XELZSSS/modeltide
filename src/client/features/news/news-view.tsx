import { useMemo } from "react";
import { ExternalLink, Clock, Search } from "lucide-react";
import { useDevice, useTranslation } from "@/client/providers";
import type { TranslationKey } from "@/shared/i18n";
import { Pagination } from "@/client/components/ui/pagination";
import { useSuspenseNewsState } from "@/client/api/api-queries";
import { EmptyState, PartialNotice } from "@/client/components/feedback";
import { SuspenseQuery } from "@/client/router/suspense-query";
import { safeHref, formatRelativeTime, formatDate } from "@/client/utils/format";
import { TabbedPage } from "@/client/components/layout";
import { useClientTab } from "@/client/hooks/use-client-tab";
import { type TabItem } from "@/client/components/ui/tabs";
import type { NewsItem, NewsCategory } from "@/shared/types";
import { NEWS_CATEGORIES } from "@/shared/config";
import { usePagedData } from "@/client/components/data/table";

const CATEGORY_LABELS: Record<NewsCategory, TranslationKey> = {
  industry: "catIndustry",
  opensource: "catOpenSource",
  hardware: "catHardware",
  funding: "catFunding",
  research: "catResearch",
};

const getNewsRowId = (item: NewsItem): string => item.link || `${item.source}::${item.title}::${item.pubDate}`;

function NewsList({ news }: { news: NewsItem[] }) {
  const { t, lang } = useTranslation();
  const { isMobile } = useDevice();
  const { page, totalPages, pagedData: currentNews, goToPage } = usePagedData(news, getNewsRowId, isMobile ? 10 : 20);

  if (news.length === 0) return <EmptyState icon={Search} message={t("noResults")} />;

  return (
    <div className="flex flex-col gap-2">
      <ul className="ui-card flex flex-col divide-y divide-border">
        {currentNews.map((item) => {
          const href = safeHref(item.link);
          const key = getNewsRowId(item);
          const body = (
            <>
              <h2 className="ui-body font-medium leading-relaxed min-w-0 break-words decoration-accent/50 underline-offset-4 group-hover:underline transition-colors duration-fast">
                {item.title}
              </h2>
              <div className="flex items-center gap-3 shrink-0 ui-caption mt-1">
                <span className="hidden sm:inline truncate max-w-48">{item.source}</span>
                <span className="flex items-center gap-1.5 shrink-0" title={formatDate(item.pubDate, lang)}>
                  <Clock size={12} aria-hidden="true" />
                  {formatRelativeTime(item.pubDate, t, lang)}
                </span>
                <ExternalLink
                  size={14}
                  className="md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-fast shrink-0"
                  aria-hidden="true"
                />
              </div>
            </>
          );
          const rowClass =
            "group flex items-start justify-between gap-4 px-4 py-3.5 transition-colors duration-fast hoverable:hover:bg-hover focus-visible:outline-none focus-visible:bg-hover";
          return (
            <li key={key} className="animate-fade-in">
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={rowClass}
                  aria-label={t("newsItemLabel", { title: item.title, source: item.source })}
                >
                  {body}
                </a>
              ) : (
                <div className={rowClass}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onChange={goToPage} />}
    </div>
  );
}

function NewsCategoryContent({ categoryId }: { categoryId: NewsCategory }) {
  const { items: news, partial } = useSuspenseNewsState(categoryId);
  return (
    <>
      {partial && <PartialNotice />}
      <NewsList key={categoryId} news={news} />
    </>
  );
}

export function NewsView() {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useClientTab("tab", NEWS_CATEGORIES, NEWS_CATEGORIES[0]!);

  const tabs: TabItem[] = useMemo(() => NEWS_CATEGORIES.map((id) => ({ id, label: t(CATEGORY_LABELS[id]) })), [t]);

  return (
    <TabbedPage title={t("aiNews")} tabs={tabs} activeTab={activeCategory} onTabChange={setActiveCategory}>
      <SuspenseQuery resetKey={activeCategory}>
        <NewsCategoryContent categoryId={activeCategory} />
      </SuspenseQuery>
    </TabbedPage>
  );
}
