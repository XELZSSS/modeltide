<script setup lang="ts">
import { useTranslation } from "@/client/i18n";
import { REPO_URL } from "@/client/nav/nav-config";
import { useNavigation, usePrefetch } from "@/client/nav/navigation";
import SafeLink from "@/client/components/ui/safe-link.vue";
import { FOCUS_RING, ICON_BUTTON } from "@/client/components/ui/interactive-classes";
import { PAGE_GUTTER, PAGE_WIDTH } from "@/client/nav/layout";
import { PATHS } from "@/client/router/paths";
import NavSearch from "@/client/search/nav-search.vue";
import ThemeToggle from "./theme-toggle.vue";
import LanguageToggle from "./language-toggle.vue";

const { all, isActive } = useNavigation();
const { t } = useTranslation();
const { hover, cancel } = usePrefetch();

const INNER = [PAGE_WIDTH, PAGE_GUTTER, "flex items-center gap-1"];
</script>

<template>
  <!--
    Opaque, and in flow rather than `fixed`: `main` is the scroll port (`overflow-y-auto`), so this bar already never
    moves over the content — the shell's flex column holds it above the scroll area, and `fixed` would only pull it out
    of that column and need its height added back as padding. No translucency, no blur, no height change on scroll: a
    bar that tints whatever passes beneath it also loses the hairline that lines it up with the page's edges.
    The same height the phone bar uses: the tallest thing in it is a small control, so a taller bar only adds air
    around small buttons.
  -->
  <nav
    class="sticky top-0 z-30 hidden h-14 shrink-0 items-center border-b border-border bg-bg-primary md:flex"
    :aria-label="t('navPrimary')"
  >
    <div :class="INNER">
      <SafeLink
        :href="PATHS.home"
        :class="[
          'mr-3 shrink-0 rounded-md ui-card-title font-semibold tracking-title text-text-primary ui-motion hoverable:hover:opacity-70',
          FOCUS_RING,
        ]"
      >
        {{ t("appName") }}
      </SafeLink>
      <div class="flex items-center gap-0.5">
        <SafeLink
          v-for="item in all"
          :key="item.path"
          :href="item.path"
          :aria-label="item.label"
          :aria-current="isActive(item) ? 'page' : undefined"
          :class="[
            `inline-flex h-8 items-center rounded-md px-3 ui-label font-medium whitespace-nowrap ui-motion ${FOCUS_RING}`,
            isActive(item)
              ? 'bg-surface-hover text-text-primary'
              : 'text-text-secondary hoverable:hover:bg-surface-hover hoverable:hover:text-text-primary',
          ]"
          @mouseenter="hover(item.path)"
          @mouseleave="cancel"
          @focus="hover(item.path)"
          @blur="cancel"
        >
          {{ item.label }}
        </SafeLink>
      </div>
      <div class="ml-auto flex min-w-0 items-center gap-2">
        <NavSearch />
        <ThemeToggle />
        <LanguageToggle />
        <SafeLink :href="REPO_URL" target="_blank" rel="noopener noreferrer" aria-label="GitHub" :class="ICON_BUTTON">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path
              d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"
            />
          </svg>
        </SafeLink>
      </div>
    </div>
  </nav>
</template>
