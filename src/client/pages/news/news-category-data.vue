<script setup lang="ts">
import { computed, watch } from "vue";
import { Clock, ExternalLink, Search } from "@lucide/vue";
import { useTranslation } from "@/client/i18n";
import { useDevice } from "@/client/device";
import { useSuspenseNewsState } from "@/client/api/hooks";
import { assertPayloadShape } from "@/client/api/payload-normalize";
import EmptyState from "@/client/components/feedback/empty-state.vue";
import PartialNotice from "@/client/components/feedback/partial-notice.vue";
import Pagination from "@/client/components/navigation/pagination.vue";
import { DEFAULT_PAGE_SIZE, MOBILE_PAGE_SIZE, usePagedData } from "@/client/components/table/paging";
import { formatDate, formatRelativeTime, safeHref } from "@/shared/utils";
import type { NewsCategory, NewsItem } from "@/shared/types";
import { ROW_PADDING } from "@/client/nav/layout";

const ROW_CLASS = `group flex flex-col gap-1 md:flex-row md:items-start md:justify-between md:gap-4 ${ROW_PADDING} ui-motion focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset hoverable:hover:bg-surface-hover`;

const props = defineProps<{ categoryId: NewsCategory }>();

const { t, lang } = useTranslation();
const isMobile = useDevice();

const state = await useSuspenseNewsState(props.categoryId);

// A malformed payload is a failure, not an empty category: it has to reach the error boundary on every refetch, the
// way the releases and home views do, instead of rendering "no results" over a broken response.
watch(
  () => state.value.malformed,
  (malformed) => assertPayloadShape(malformed, "news"),
  { immediate: true },
);

const paged = usePagedData(
  // A row with no usable link has nowhere to go, so it is not rendered at all: the parser already refuses such an item,
  // and this keeps a copy that predates that check from showing a headline that cannot be opened.
  computed(() => state.value.items.filter((item) => safeHref(item.link) !== undefined)),
  getRowId,
  () => (isMobile.value ? MOBILE_PAGE_SIZE : DEFAULT_PAGE_SIZE),
);

const rows = computed(() =>
  paged.pagedData.value.map((item) => ({ item, id: getRowId(item), href: safeHref(item.link) })),
);

/**
 * `link` is the row identity: the parser guarantees it non-empty, deduplication keys on it, and `NewsItem` carries no
 * separate id. The composite fallback only covers a row that reached the client without one, which the parser does not
 * produce — it keeps the table keyed rather than throwing over a row that is otherwise renderable.
 */
function getRowId(item: NewsItem): string {
  return item.link || `${item.source}::${item.title}::${item.pubDate}`;
}

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
  <PartialNotice v-if="state.partial" />
  <EmptyState v-if="rows.length === 0" :icon="Search" :message="t('noResults')" />
  <div v-else class="flex flex-col gap-2">
    <ul class="flex ui-card flex-col divide-y divide-border overflow-hidden">
      <li v-for="row in rows" :key="row.id">
        <component :is="rowTag(row.href)" v-bind="rowAttrs(row.item, row.href)" :class="ROW_CLASS">
          <h2
            class="min-w-0 ui-body font-medium break-words decoration-text-primary/40 underline-offset-4 ui-motion [@media(hover:hover)]:group-hover:underline"
          >
            {{ row.item.title }}
          </h2>
          <div class="flex items-center gap-3 ui-caption md:shrink-0">
            <span class="max-w-48 truncate" v-tooltip="row.item.source">{{ row.item.source }}</span>
            <span class="flex shrink-0 items-center gap-1.5" :title="formatDate(row.item.pubDate, lang)">
              <Clock :size="12" aria-hidden="true" />
              {{ formatRelativeTime(row.item.pubDate, t, lang) }}
            </span>
            <ExternalLink
              :size="14"
              class="shrink-0 ui-motion [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
              aria-hidden="true"
            />
          </div>
        </component>
      </li>
    </ul>
    <Pagination :page="paged.page.value" :total-pages="paged.totalPages.value" @change="paged.goToPage" />
  </div>
</template>
