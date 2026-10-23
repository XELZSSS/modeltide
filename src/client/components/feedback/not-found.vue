<script setup lang="ts">
import { ArrowLeft } from "@lucide/vue";
import type { TranslationKey } from "@/shared/i18n";
import { cn } from "@/client/utils/cn";
import { useTranslation } from "@/client/i18n";
import { buttonVariants } from "@/client/components/ui/button-variants";
import PageContainer from "@/client/components/layout/page-container.vue";
import SafeLink from "@/client/components/ui/safe-link.vue";

/**
 * One template for two different situations: a real route 404, and "this model is not in the index". The second
 * case passes `code: null` so a valid URL is not presented as a wrong one, and its own copy keys.
 */
const props = withDefaults(
  defineProps<{ headingKey?: TranslationKey; bodyKey?: TranslationKey; code?: string | null }>(),
  { headingKey: "notFoundTitle", bodyKey: "notFound", code: "404" },
);

const { t } = useTranslation();
</script>

<template>
  <PageContainer>
    <div class="flex flex-col items-center justify-center gap-4 py-16 text-center ui-anim-rise sm:py-24">
      <div v-if="props.code" class="border border-border bg-bg-secondary px-4 py-2 ui-display">{{ props.code }}</div>
      <h1 class="ui-section-title">{{ t(props.headingKey) }}</h1>
      <p class="ui-body-secondary max-w-md text-balance">{{ t(props.bodyKey) }}</p>
      <SafeLink href="/" :class="cn('mt-2', buttonVariants({ variant: 'primary', size: 'md' }))">
        <ArrowLeft :size="14" />
        {{ t("backToHome") }}
      </SafeLink>
    </div>
  </PageContainer>
</template>
