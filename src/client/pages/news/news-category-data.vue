<script setup lang="ts">
import { computed } from "vue";
import { Clock, ExternalLink, Search } from "@lucide/vue";
import { useTranslation } from "@/client/i18n";
import { useDevice } from "@/client/device";
import { useSuspenseNewsState } from "@/client/api/hooks";
import { assertPayloadShape } from "@/client/api/payload-normalize";
import EmptyState from "@/client/components/empty-state.vue";
import PartialNotice from "@/client/components/partial-notice.vue";
import Pagination from "@/client/components/pagination.vue";
import { DEFAULT_PAGE_SIZE, MOBILE_PAGE_SIZE, usePagedData } from "@/client/components/table/paging";
import { formatDate, formatRelativeTime, safeHref } from "@/shared/utils";
import type { NewsCategory, NewsItem } from "@/shared/types";
import { ROW_PADDING } from "@/client/nav/layout";

const ROW_CLASS = `group flex items-start justify-between gap-4 ${ROW_PADDING} transition-colors duration-fast hoverable:hover:bg-hover focus-visible:outline-none focus-visible:bg-hover`;

const props = defineProps<{ categoryId: NewsCategory }>();

const { t, lang } = useTranslation();
const isMobile = useDevice();

const state = await useSuspenseNewsState(props.categoryId);
assertPayloadShape(state.value.malformed, "news");

const paged = usePagedData(
  computed(() => state.value.items),
  getRowId,
  () => (isMobile.value ? MOBILE_PAGE_SIZE : DEFAULT_PAGE_SIZE),
);

const rows = computed(() =>
  paged.pagedData.value.map((item) => ({ item, id: getRowId(item), href: safeHref(item.link) })),
);

function getRowId(item: NewsItem): string {
  if (item == null) return "";
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
    <Pagination :page="paged.page.value" :total-pages="paged.totalPages.value" @change="paged.goToPage" />
  </div>
</template>
