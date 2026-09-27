<script setup lang="ts">
import { ArrowLeft } from "@lucide/vue";
import { cn } from "@/client/utils/cn";
import { useTranslation } from "@/client/i18n";
import { buttonVariants } from "@/client/components/ui/button-variants";
import PageContainer from "@/client/components/layout/page-container.vue";
import SafeLink from "@/client/components/safe-link.vue";

const { t } = useTranslation();
</script>

<template>
  <PageContainer>
    <div class="flex flex-col items-center justify-center gap-4 py-24 text-center animate-enter">
      <div class="border border-border bg-bg-secondary px-4 py-2 text-4xl sm:text-5xl font-semibold tabular-nums text-text-tertiary">
        404
      </div>
      <h1 class="ui-section-title">{{ t("notFoundTitle") }}</h1>
      <p class="ui-body-secondary max-w-md text-balance">{{ t("notFound") }}</p>
      <SafeLink href="/" :class="cn('mt-2', buttonVariants({ variant: 'primary', size: 'md' }))">
        <ArrowLeft :size="14" />
        {{ t("backToHome") }}
      </SafeLink>
    </div>
  </PageContainer>
</template>
