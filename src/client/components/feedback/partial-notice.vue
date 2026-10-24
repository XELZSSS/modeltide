<script setup lang="ts">
/** The standard "some sources failed" strip: the payload arrived, part of it did not. */
import { useTranslation } from "@/client/i18n";
import Notice from "@/client/components/feedback/notice.vue";

const { t } = useTranslation();
</script>

<template>
  <Notice>{{ t("partialDataNotice") }}</Notice>
</template>
