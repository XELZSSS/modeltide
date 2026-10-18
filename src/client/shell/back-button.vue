<script setup lang="ts">
import { computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { ArrowLeft } from "@lucide/vue";
import type { TranslationKey } from "@/shared/i18n";
import { useTranslation } from "@/client/i18n";
import { canGoBack, historyFrom, navigate } from "@/client/router";
import Button from "@/client/components/button.vue";

const props = defineProps<{ labelKey: TranslationKey; to: string }>();

const router = useRouter();
const route = useRoute();
const { t } = useTranslation();

// historyFrom() reads untracked history.state; touching route.fullPath re-derives the label once per navigation.
const label = computed(() => {
  void route.fullPath;
  const previous = historyFrom();
  return previous == null || previous === props.to ? t(props.labelKey) : t("back");
});

function goBack(): void {
  if (canGoBack()) {
    router.back();
  } else {
    navigate(props.to, true);
  }
}
</script>

<template>
  <Button size="sm" variant="outline" class="self-start" @click="goBack">
    <ArrowLeft class="size-4" />
    {{ label }}
  </Button>
</template>
