<script setup lang="ts">
import { useTranslation } from "@/client/i18n";
import Notice from "@/client/components/feedback/notice.vue";

const { t } = useTranslation();
</script>

<template>
  <Notice>{{ t("partialDataNotice") }}</Notice>
</template>
