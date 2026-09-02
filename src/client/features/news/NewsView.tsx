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
import { usePagedData } from "@/client/hooks";

// Single source for category ids is the shared NEWS_CATEGORIES (mirrors the server's RSS config).
const CATEGORY_LABELS: Record<NewsCategory, TranslationKey> = {
  industry: "catIndustry",
  opensource: "catOpenSource",
  hardware: "catHardware",
  funding: "catFunding",
};

function NewsList({ news }: { news: NewsItem[] }) {
  const { t } = useTranslation();
  const { isMobile } = useDevice();
  // Fewer items per page on mobile to keep the list manageable.
  const { page, totalPages, pagedData: currentNews, goToPage } = usePagedData(news, undefined, isMobile ? 10 : 20);

  if (news.length === 0) return <EmptyState icon={Search} message={t("noResults")} />;

  return (
    <div className="flex flex-col">
      <div className="flex flex-col divide-y divide-border">
        {currentNews.map((item) => (
          <a
            // Keys must be unique across feeds; guids are only feed-scoped, but the
            // server dedupes by link, so the link is the collision-free identifier.
            key={item.link}
            href={safeHref(item.link) ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start justify-between gap-4 py-3 transition-colors"
            aria-label={`${item.title} - ${item.source}`}
          >
            <h3 className="text-sm font-medium text-text-primary leading-relaxed group-hover:text-accent transition-colors min-w-0 break-words">
              {item.title}
            </h3>
            <div className="flex items-center gap-3 shrink-0 text-xs text-text-tertiary mt-0.5">
              <span className="hidden sm:inline">{item.source}</span>
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {formatRelativeTime(item.pubDate, t)}
              </span>
              <ExternalLink size={14} className="md:opacity-0 md:group-hover:opacity-100 transition-opacity" />
            </div>
          </a>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="mt-4 flex justify-center">
          <Pagination page={page} totalPages={totalPages} onChange={goToPage} />
        </div>
      )}
    </div>
  );
}

function NewsCategoryContent({ categoryId }: { categoryId: NewsCategory }) {
  const { data: news } = useSuspenseNewsByCategory(categoryId);
  // Keying the list by category remounts it so pagination resets between tabs.
  return <NewsList key={categoryId} news={news} />;
}

/** Tabbed AI news feed, one category at a time with per-category pagination. */
export function NewsView() {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useUrlTab(NEWS_CATEGORIES, NEWS_CATEGORIES[0]!);

  const tabs: TabItem[] = useMemo(() => NEWS_CATEGORIES.map((id) => ({ id, label: t(CATEGORY_LABELS[id]) })), [t]);

  return (
    <TabbedPage
      title={t("aiNews")}
      tabs={tabs}
      activeTab={activeCategory}
      onTabChange={setActiveCategory}
    >
      {/* Keyed by category so tab switches get a fresh Suspense fallback and error boundary. */}
      <SuspenseQuery key={activeCategory}>
        <NewsCategoryContent categoryId={activeCategory} />
      </SuspenseQuery>
    </TabbedPage>
  );
}
