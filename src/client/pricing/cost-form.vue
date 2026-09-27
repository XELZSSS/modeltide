<script setup lang="ts">
import { computed } from "vue";
import { formatDollar } from "@/client/utils/format";
import Input from "@/client/components/ui/input.vue";
import { useTranslation } from "@/client/i18n";
import { COST_FIELDS, type CostFieldId, type CostInputState } from "@/client/pricing/cost-inputs";

interface CostFieldDef {
  id: CostFieldId;
  value: string;
  onChange: (v: string) => void;
  label: string;
  unit?: string;
}

const props = withDefaults(
  defineProps<{ state: CostInputState; layout?: "input-label" | "label-input-unit"; avgCost?: number | null }>(),
  { layout: "input-label" },
);

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

function isInvalid(value: string): boolean {
  const trimmed = value.trim();
  return trimmed !== "" && !/^\d*(\.\d*)?$/.test(trimmed);
}

function onFieldChange(field: CostFieldDef, value: string | undefined): void {
  field.onChange(value ?? "");
}
</script>

<template>
  <template v-for="field in fields" :key="field.id">
    <div v-if="layout === 'label-input-unit'" class="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
      <label :for="`cost-${field.id}`" class="text-xs text-text-secondary min-w-0">{{ field.label }}</label>
      <Input
        :id="`cost-${field.id}`"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        class="w-20 h-9 shrink-0"
        :model-value="field.value"
        :aria-invalid="isInvalid(field.value) ? true : undefined"
        @update:model-value="onFieldChange(field, $event)"
      />
      <span v-if="field.unit" class="text-xs text-text-secondary shrink-0">{{ field.unit }}</span>
    </div>
    <div v-else class="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
      <Input
        :id="`cost-${field.id}`"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        class="w-24 sm:w-28 shrink-0"
        :model-value="field.value"
        :placeholder="field.label"
        :aria-label="field.unit ? `${field.label} (${field.unit})` : field.label"
        :aria-invalid="isInvalid(field.value) ? true : undefined"
        @update:model-value="onFieldChange(field, $event)"
      />
      <label :for="`cost-${field.id}`" class="ui-caption min-w-0 cursor-text">
        {{ field.unit ? `${field.label} (${field.unit})` : field.label }}
      </label>
    </div>
  </template>
  <div v-if="layout === 'input-label' && avgCost !== undefined" class="flex items-center gap-2">
    <span class="text-sm text-text-secondary">{{ t("estimatedMonthlyCost") }}:</span>
    <span class="text-lg font-semibold font-mono tabular-nums">
      {{ avgCost == null ? t("notAvailable") : formatDollar(avgCost, t) }}
    </span>
    <span class="ui-caption">{{ t("perModelAvg") }}</span>
  </div>
</template>
