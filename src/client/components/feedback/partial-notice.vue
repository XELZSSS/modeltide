<script setup lang="ts">
import { useTranslation } from "@/client/i18n";
import Notice from "@/client/components/feedback/notice.vue";

defineProps<{ message?: string }>();

const { t } = useTranslation();
</script>

<template>
  <Notice>{{ message ?? t("partialDataNotice") }}</Notice>
</template>
