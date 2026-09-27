<script setup lang="ts">
import { ArrowLeft } from "@lucide/vue";
import type { TranslationKey } from "@/shared/i18n";
import { useTranslation } from "@/client/i18n";
import { canGoBack, historyFrom } from "@/client/router";
import { useRouter } from "vue-router";
import Button from "@/client/components/ui/button.vue";

const props = defineProps<{ labelKey: TranslationKey; to: string }>();

const router = useRouter();
const { t } = useTranslation();

function goBack(): void {
  if (canGoBack()) router.back();
  else void router.replace(props.to);
}
</script>

<template>
  <Button size="sm" variant="outline" class="self-start" @click="goBack">
    <ArrowLeft class="size-4" />
    {{ historyFrom() == null || historyFrom() === to ? t(labelKey) : t("back") }}
  </Button>
</template>
