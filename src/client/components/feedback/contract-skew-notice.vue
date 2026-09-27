<script setup lang="ts">
import { onUnmounted, ref } from "vue";
import { hasContractSkew, subscribeContractSkew } from "@/client/api/api-client";
import { useTranslation } from "@/client/i18n";
import Notice from "@/client/components/feedback/notice.vue";

const { t } = useTranslation();

const stale = ref(hasContractSkew());
const unsubscribe = subscribeContractSkew(() => {
  stale.value = hasContractSkew();
});

onUnmounted(unsubscribe);
</script>

<template>
  <Notice v-if="stale">{{ t("contractSkewNotice") }}</Notice>
</template>
