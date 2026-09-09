"use client";
import { useMemo } from "react";
import { ExternalLink, Clock, Search } from "lucide-react";
import { useTranslation } from "@/client/providers";
import type { TranslationKey } from "@/shared/i18n";
import { Pagination } from "@/client/components/ui/pagination";
import { useSuspenseNewsState } from "@/client/api/queries";
import { SuspenseQuery, EmptyState, PartialNotice } from "@/client/components/feedback";
import { safeHref, formatRelativeTime, formatDate } from "@/client/utils/format";
import { TabbedPage } from "@/client/components/layout";
import { useClientTab } from "@/client/hooks/use-client-tab";
import { type TabItem } from "@/client/components/ui/tabs";
import type { NewsItem, NewsCategory } from "@/shared/types";
import { NEWS_CATEGORIES } from "@/shared/config";
import { useDevice } from "@/client/providers";
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
    <div className="flex flex-col">
      <ul className="flex flex-col divide-y divide-border">
        {currentNews.map((item, idx) => {
          const href = safeHref(item.link);
          const key = `${getNewsRowId(item)}::${idx}`;
          const body = (
            <>
              <h3 className="ui-body font-medium leading-relaxed group-hover:text-accent transition-colors min-w-0 break-words">
                {item.title}
              </h3>
              <div className="flex items-center gap-3 shrink-0 ui-caption mt-0.5">
                <span className="hidden sm:inline">{item.source}</span>
                <span className="flex items-center gap-1.5" title={formatDate(item.pubDate, lang)}>
                  <Clock size={12} />
                  {formatRelativeTime(item.pubDate, t, lang)}
                </span>
                <ExternalLink size={14} className="md:opacity-0 md:group-hover:opacity-100 transition-opacity" />
              </div>
            </>
          );
          const rowClass = "group flex items-start justify-between gap-4 py-3";
          return (
            <li key={key}>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${rowClass} transition-colors`}
                  aria-label={t("newsItemLabel", { title: item.title, source: item.source })}
                >
                  {body}
                </a>
              ) : (
                <span className={rowClass}>{body}</span>
              )}
            </li>
          );
        })}
      </ul>
      {totalPages > 1 && (
        <div className="mt-5 flex justify-center">
          <Pagination page={page} totalPages={totalPages} onChange={goToPage} />
        </div>
      )}
    </div>
  );
}

function NewsCategoryContent({ categoryId }: { categoryId: NewsCategory }) {
  const { t } = useTranslation();
  const { items: news, partial } = useSuspenseNewsState(categoryId);
  return (
    <>
      {partial && (
        <div className="mb-3">
          <PartialNotice message={t("partialDataNotice")} />
        </div>
      )}
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
      <SuspenseQuery key={activeCategory}>
        <NewsCategoryContent categoryId={activeCategory} />
      </SuspenseQuery>
    </TabbedPage>
  );
}
