<script setup lang="ts">
import { computed } from "vue";
import { formatDollar } from "@/shared/utils";
import Input from "@/client/components/ui/input.vue";
import { useTranslation } from "@/client/i18n";
import { COST_FIELDS, isCostFieldInput, type CostFieldId, type CostInputState } from "./cost-inputs";

interface CostFieldDef {
  id: CostFieldId;
  value: string;
  onChange: (v: string) => void;
  label: string;
  unit?: string;
}

const props = defineProps<{ state: CostInputState; avgCost?: number | null }>();

const { t } = useTranslation();

const fields = computed<CostFieldDef[]>(() =>
  COST_FIELDS.map((def) => ({
    id: def.id,
    value: props.state.values.value[def.id],
    onChange: (v: string) => props.state.setField(def.id, v),
    label: t(def.labelKey),
    unit: def.unit,
  })),
);

function onFieldChange(field: CostFieldDef, value: string): void {
  field.onChange(value);
}
</script>

<template>
  <template v-for="field in fields" :key="field.id">
    <div class="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
      <Input
        :id="`cost-${field.id}`"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        class="w-24 sm:w-28 shrink-0"
        :model-value="field.value"
        :placeholder="field.label"
        :aria-label="field.unit ? `${field.label} (${field.unit})` : field.label"
        :aria-invalid="!isCostFieldInput(field.value) ? true : undefined"
        :aria-describedby="!isCostFieldInput(field.value) ? `cost-${field.id}-error` : undefined"
        @update:model-value="onFieldChange(field, $event)"
      />
      <label :for="`cost-${field.id}`" class="ui-caption min-w-0 cursor-text">
        {{ field.unit ? `${field.label} (${field.unit})` : field.label }}
      </label>
      <p v-if="!isCostFieldInput(field.value)" :id="`cost-${field.id}-error`" class="w-full text-xs text-destructive">
        {{ t("invalidCostValue") }}
      </p>
    </div>
  </template>
  <div v-if="avgCost !== undefined" class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
    <span class="text-sm text-text-secondary">{{ t("estimatedMonthlyCost") }}:</span>
    <span class="ui-mono-value text-lg font-semibold">
      {{ avgCost == null ? t("notAvailable") : formatDollar(avgCost, t) }}
    </span>
    <span class="ui-caption">{{ t("perModelAvg") }}</span>
  </div>
</template>
