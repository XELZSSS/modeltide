<script setup lang="ts">
import { computed } from "vue";
import { cva } from "class-variance-authority";
import { cn } from "@/client/utils/cn";

// The active underline ends at the button's own bottom edge (`bottom-0`, not `-bottom-px`). The tab strip is an
// `overflow-x` scroller, which clips at its padding box, so a line hanging 1px below the button was never painted.
const tabButtonVariants = cva(
  "font-medium ui-motion ui-press whitespace-nowrap shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none relative pb-2.5 after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-accent after:origin-left ui-motion-indicator",
  {
    variants: {
      active: {
        true: "text-text-primary after:scale-x-100",
        false: "text-text-secondary after:scale-x-0 hoverable:hover:text-text-primary",
      },
      // `pt`/`px` rather than `py`: the base `pb-2.5` is the gap the active underline sits in, so growing the button
      // for fingers has to come from the top and sides or the rule drifts away from the label.
      size: {
        sm: "px-2 pt-3 text-xs tracking-label md:px-1 md:pt-1.5",
        md: "px-2 pt-3.5 text-sm tracking-label md:px-1 md:pt-2",
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

const emit = defineEmits<{ click: []; intent: [active: boolean] }>();

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
    @mouseenter="emit('intent', true)"
    @mouseleave="emit('intent', false)"
    @focus="emit('intent', true)"
    @blur="emit('intent', false)"
    @touchstart.passive="emit('intent', true)"
    @click="emit('click')"
  >
    <slot />
  </button>
</template>
