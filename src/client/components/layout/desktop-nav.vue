<script setup lang="ts">
import { Settings } from "@lucide/vue";
import { useTranslation } from "@/client/i18n";
import { REPO_URL } from "@/client/config/nav-config";
import { usePathname } from "@/client/router";
import { isNavActive, useNavigation, usePrefetch } from "@/client/components/layout/navigation";
import SafeLink from "@/client/components/safe-link.vue";

const emit = defineEmits<{ settingsOpen: [] }>();

const pathname = usePathname();
const { all } = useNavigation();
const { t } = useTranslation();
const { hover, cancel } = usePrefetch();

const ICON_BUTTON =
  "p-1.5 text-text-secondary hoverable:hover:text-text-primary transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";
</script>

<template>
  <nav
    class="hidden md:flex h-12 shrink-0 items-center border-b border-border bg-bg-primary sticky top-0 z-30"
    :aria-label="t('navPrimary')"
  >
    <div class="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 flex items-center gap-1">
      <div class="flex items-center gap-0.5">
        <SafeLink
          v-for="item in all"
          :key="item.path"
          :href="item.path"
          :aria-label="item.label"
          :aria-current="isNavActive(pathname, item) ? 'page' : undefined"
          :class="[
            'relative px-3 py-1.5 text-sm font-medium transition-colors duration-fast whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1',
            isNavActive(pathname, item) ? 'text-text-primary' : 'text-text-secondary hoverable:hover:text-text-primary',
          ]"
          @mouseenter="hover(item.path)"
          @mouseleave="cancel"
          @focus="hover(item.path)"
          @blur="cancel"
        >
          {{ item.label }}
          <span
            aria-hidden="true"
            :class="[
              'absolute inset-x-3 -bottom-px h-px bg-accent transition-transform duration-base origin-left',
              isNavActive(pathname, item) ? 'scale-x-100' : 'scale-x-0',
            ]"
          />
        </SafeLink>
      </div>
      <div class="ml-auto flex items-center gap-1">
        <SafeLink
          :href="REPO_URL"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub"
          :class="ICON_BUTTON"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path
              d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"
            />
          </svg>
        </SafeLink>
        <button type="button" :aria-label="t('settings')" :class="ICON_BUTTON" @click="emit('settingsOpen')">
          <Settings :size="16" />
        </button>
      </div>
    </div>
  </nav>
</template>
