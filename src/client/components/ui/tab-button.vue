<script setup lang="ts">
import { computed } from "vue";
import { cva } from "class-variance-authority";
import { cn } from "@/client/utils/cn";

const tabButtonVariants = cva(
  "font-medium transition-colors duration-fast whitespace-nowrap shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none relative pb-2.5",
  {
    variants: {
      active: {
        true: "text-text-primary after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-accent",
        false: "text-text-secondary hoverable:hover:text-text-primary",
      },
      size: {
        sm: "px-1 py-1.5 text-xs tracking-label",
        md: "px-1 py-2 text-sm tracking-label",
      },
    },
    defaultVariants: { active: false, size: "md" },
  },
);

const props = withDefaults(
  defineProps<{
    active?: boolean;
    size?: "sm" | "md";
    id?: string;
    tabIndex?: number;
    ariaControls?: string;
    role?: "tab" | "radio";
    class?: string;
  }>(),
  { active: false, size: "md", role: "tab" },
);

const emit = defineEmits<{ click: [] }>();

const classes = computed(() => cn(tabButtonVariants({ active: props.active, size: props.size }), props.class));
const ariaChecked = computed(() =>
  props.role === "tab" ? { "aria-selected": props.active } : { "aria-checked": props.active },
);
const tabindex = computed(() => props.tabIndex ?? (props.role === "tab" ? (props.active ? 0 : -1) : 0));
</script>

<template>
  <button
    type="button"
    :role="role"
    :id="id"
    :aria-controls="ariaControls"
    v-bind="ariaChecked"
    :tabindex="tabindex"
    :class="classes"
    @click="emit('click')"
  >
    <slot />
  </button>
</template>
