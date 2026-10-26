<script setup lang="ts">
import { computed } from "vue";
import { cva } from "class-variance-authority";
import { cn } from "@/client/utils/cn";
import { FOCUS_RING } from "@/client/components/ui/interactive-classes";

/**
 * One tab in a tab strip, acting as a `tab` in a tablist or a `radio` in a segmented control — hence the selected state
 * binding to `aria-selected` or `aria-checked` rather than always the same attribute.
 *
 * The look is the reference segmented control: the strip is the muted container (see `segmented-group.vue`) and the
 * active trigger is the raised `bg-background` pill with a hairline lift. Selection is a surface change, not an
 * underline.
 *
 * Defaults live in the prop defaults below; the variants carry no `defaultVariants`, because `active` and `size` are
 * always supplied by them and a second set could only drift.
 */
const tabButtonVariants = cva(
  `relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap ui-motion ${FOCUS_RING} disabled:pointer-events-none disabled:opacity-50`,
  {
    variants: {
      active: {
        // The pill has no border, so this lift is its only edge: without it the white fill on the muted track is a
        // ~1.1:1 step and the selected tab reads as unselected.
        true: "bg-background text-text-primary shadow-xs",
        false: "text-text-secondary hoverable:hover:bg-background/60 hoverable:hover:text-text-primary",
      },
      // Touch first again: `h-10` under the `md:` breakpoint keeps a 40px target, then the desktop height matches the
      // 32px pill the reference segmented control uses.
      size: {
        sm: "h-10 px-3 text-xs md:h-7 md:px-2.5",
        md: "h-10 px-3.5 text-sm md:h-8 md:px-3",
      },
    },
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
