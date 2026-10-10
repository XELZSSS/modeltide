<script setup lang="ts">
import { computed, defineComponent, effectScope, onUnmounted, type PropType } from "vue";
import { Clock, ExternalLink, Search } from "@lucide/vue";
import { useTranslation } from "@/client/i18n";
import { useDevice } from "@/client/device";
import { useSuspenseNewsState } from "@/client/api/api-queries";
import { assertPayloadShape } from "@/client/api/payload-normalize";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import Pagination from "@/client/components/ui/pagination.vue";
import TabbedPage from "@/client/components/layout/tabbed-page.vue";
import SuspenseQuery from "@/client/router/suspense-query.vue";
import { useClientTab } from "@/client/hooks/use-client-tab";
import { DEFAULT_PAGE_SIZE, MOBILE_PAGE_SIZE, usePagedData } from "@/client/components/data/table/paging";
import { formatDate, formatRelativeTime, safeHref } from "@/client/utils/format";
import type { TabItem } from "@/client/components/ui/tabs";
import type { TranslationKey } from "@/shared/i18n";
import type { NewsCategory, NewsItem } from "@/shared/types";
import { NEWS_CATEGORIES } from "@/shared/config";
import { ROW_PADDING } from "@/client/config/layout";

const CATEGORY_LABELS: Record<NewsCategory, TranslationKey> = {
  industry: "catIndustry",
  opensource: "catOpenSource",
  hardware: "catHardware",
  funding: "catFunding",
  research: "catResearch",
};

const ROW_CLASS = `group flex items-start justify-between gap-4 ${ROW_PADDING} transition-colors duration-fast hoverable:hover:bg-hover focus-visible:outline-none focus-visible:bg-hover`;

const getNewsRowId = (item: NewsItem): string => {
  if (item == null) return "";
  return item.link || `${item.source}::${item.title}::${item.pubDate}`;
};

const NewsCategoryData = defineComponent({
  props: { categoryId: { type: String as PropType<NewsCategory>, required: true } },
  async setup(loaderProps, { slots }) {
    const isMobile = useDevice();
    const scope = effectScope(true);
    onUnmounted(() => scope.stop());
    const state = await useSuspenseNewsState(loaderProps.categoryId);
    assertPayloadShape(state.value.malformed, "news");
    const paged = scope.run(() =>
      usePagedData(
        computed(() => state.value.items),
        getNewsRowId,
        () => (isMobile.value ? MOBILE_PAGE_SIZE : DEFAULT_PAGE_SIZE),
      ),
    );
    if (!paged) return () => null;
    // safeHref rebuilds the link string per call; derive once per row.
    const rows = computed(() =>
      paged.pagedData.value.map((item) => ({ item, id: getNewsRowId(item), href: safeHref(item.link) })),
    );
    return () =>
      slots.default?.({
        rows: rows.value,
        page: paged.page.value,
        totalPages: paged.totalPages.value,
        goToPage: paged.goToPage,
        partial: state.value.partial,
      }) ?? null;
  },
});

const { t, lang } = useTranslation();
const [activeCategory, setActiveCategory] = useClientTab("tab", NEWS_CATEGORIES, NEWS_CATEGORIES[0]!);

const tabs = computed<TabItem[]>(() => NEWS_CATEGORIES.map((id) => ({ id, label: t(CATEGORY_LABELS[id]) })));

function rowTag(href: string | undefined): string {
  return href ? "a" : "div";
}

function rowAttrs(item: NewsItem, href: string | undefined): Record<string, string> {
  if (!href) return {};
  return {
    href,
    target: "_blank",
    rel: "noopener noreferrer",
    "aria-label": t("newsItemLabel", { title: item.title, source: item.source }),
  };
}
</script>

<template>
  <TabbedPage :title="t('aiNews')" :tabs="tabs" :active-tab="activeCategory" @tab-change="setActiveCategory">
    <SuspenseQuery>
      <NewsCategoryData :category-id="activeCategory">
        <template #default="{ rows, page, totalPages, goToPage, partial }">
          <PartialNotice v-if="partial" />
          <EmptyState v-if="rows.length === 0" :icon="Search" :message="t('noResults')" />
          <div v-else class="flex flex-col gap-2">
            <ul class="ui-card flex flex-col divide-y divide-border">
              <li v-for="row in rows" :key="row.id">
                <component :is="rowTag(row.href)" v-bind="rowAttrs(row.item, row.href)" :class="ROW_CLASS">
                  <h2
                    class="ui-body font-medium leading-relaxed min-w-0 break-words decoration-accent/50 underline-offset-4 group-hover:underline transition-colors duration-fast"
                  >
                    {{ row.item.title }}
                  </h2>
                  <div class="flex items-center gap-3 shrink-0 ui-caption mt-1">
                    <span class="hidden sm:inline truncate max-w-48" :title="row.item.source">{{ row.item.source }}</span>
                    <span class="flex items-center gap-1.5 shrink-0" :title="formatDate(row.item.pubDate, lang)">
                      <Clock :size="12" aria-hidden="true" />
                      {{ formatRelativeTime(row.item.pubDate, t, lang) }}
                    </span>
                    <ExternalLink
                      :size="14"
                      class="md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-fast shrink-0"
                      aria-hidden="true"
                    />
                  </div>
                </component>
              </li>
            </ul>
            <Pagination :page="page" :total-pages="totalPages" @change="goToPage" />
          </div>
        </template>
      </NewsCategoryData>
    </SuspenseQuery>
  </TabbedPage>
</template>
