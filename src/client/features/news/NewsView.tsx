import { useMemo } from "react";
import { ExternalLink, Clock, Search } from "lucide-react";
import { useTranslation } from "@/client/providers";
import type { TranslationKey } from "@/shared/i18n";
import { Pagination } from "@/client/components/ui";
import { useSuspenseNewsByCategory } from "@/client/api/queries";
import { SuspenseQuery, EmptyState } from "@/client/components/shared";
import { safeHref, formatRelativeTime } from "@/client/utils";
import { TabbedPage } from "@/client/components/layout";
import { useUrlTab } from "@/client/hooks";
import { type TabItem } from "@/client/components/ui";
import type { NewsItem, NewsCategory } from "@/shared/types";
import { NEWS_CATEGORIES } from "@/shared/config";
import { useDevice } from "@/client/providers";
import { usePagedData } from "@/client/components/data";

// Category ids come from the shared NEWS_CATEGORIES.
const CATEGORY_LABELS: Record<NewsCategory, TranslationKey> = {
  industry: "catIndustry",
  opensource: "catOpenSource",
  hardware: "catHardware",
  funding: "catFunding",
};

// Server dedupes by link. Module-level for a stable reference.
const getNewsRowId = (item: NewsItem): string => item.link;

function NewsList({ news }: { news: NewsItem[] }) {
  const { t } = useTranslation();
  const { isMobile } = useDevice();
  const { page, totalPages, pagedData: currentNews, goToPage } = usePagedData(news, getNewsRowId, isMobile ? 10 : 20);

  if (news.length === 0) return <EmptyState icon={Search} message={t("noResults")} />;

  return (
    <div className="flex flex-col">
      <ul className="flex flex-col divide-y divide-border">
        {currentNews.map((item) => (
          <li key={item.link}>
            <a
              href={safeHref(item.link)}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start justify-between gap-4 py-3 transition-colors"
              aria-label={t("newsItemLabel", { title: item.title, source: item.source })}
            >
              <h3 className="ui-body font-medium leading-relaxed group-hover:text-accent transition-colors min-w-0 break-words">
                {item.title}
              </h3>
              <div className="flex items-center gap-3 shrink-0 ui-caption mt-0.5">
                <span className="hidden sm:inline">{item.source}</span>
                <span className="flex items-center gap-1.5">
                  <Clock size={12} />
                  {formatRelativeTime(item.pubDate, t)}
                </span>
                <ExternalLink size={14} className="md:opacity-0 md:group-hover:opacity-100 transition-opacity" />
              </div>
            </a>
          </li>
        ))}
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
  const { data: news } = useSuspenseNewsByCategory(categoryId);
  return <NewsList key={categoryId} news={news} />;
}

/** Tabbed AI news feed with per-category pagination. */
export function NewsView() {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useUrlTab(NEWS_CATEGORIES, NEWS_CATEGORIES[0]!);

  const tabs: TabItem[] = useMemo(() => NEWS_CATEGORIES.map((id) => ({ id, label: t(CATEGORY_LABELS[id]) })), [t]);

  return (
    <TabbedPage title={t("aiNews")} tabs={tabs} activeTab={activeCategory} onTabChange={setActiveCategory}>
      <SuspenseQuery key={activeCategory}>
        <NewsCategoryContent categoryId={activeCategory} />
      </SuspenseQuery>
    </TabbedPage>
  );
}
