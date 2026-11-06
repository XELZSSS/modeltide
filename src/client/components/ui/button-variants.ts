import { cva } from "class-variance-authority";

/**
 * shadcn/ui "new-york" button recipes: 36px tall, `rounded-md`, a step (1px up under the pointer, back to rest while
 * pressed), a 3px focus ring at half opacity, and a
 * monochrome filled variant (`primary`). `ui-press` keeps the pressed state to a label recolour, and `ui-motion` is the
 * only transition in the file — build/motion-guard.ts rejects raw durations and curves.
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap ui-press ui-motion focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none active:translate-y-0 disabled:pointer-events-none disabled:opacity-50 hoverable:hover:-translate-y-px [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "border border-transparent bg-primary text-primary-foreground shadow-xs [--press-text:var(--accent-contrast)] hoverable:hover:bg-primary/90",
        // The edge is the border. Adding `shadow-xs` here drew a second grey line under the same edge on every
        // outlined control.
        outline:
          "border border-border bg-background text-text-primary hoverable:hover:bg-surface-hover hoverable:hover:text-text-primary",
        ghost: "text-text-secondary hoverable:hover:bg-surface-hover hoverable:hover:text-text-primary",
      },
      size: {
        // Touch first: the mobile sizes keep every control at or above 40px, and `md:h-8`/`md:h-9` restore the
        // desktop density the tables and toolbars were designed around.
        sm: "h-10 px-3 text-[0.9375rem] md:h-8 md:px-3 md:text-[0.8125rem]",
        md: "h-10 px-4 text-[0.9375rem] md:h-9",
        icon: "size-10 md:size-9",
      },
    },
    defaultVariants: { variant: "ghost", size: "sm" },
  },
);

export type ButtonVariant = "primary" | "outline" | "ghost";
export type ButtonSize = "sm" | "md" | "icon";
