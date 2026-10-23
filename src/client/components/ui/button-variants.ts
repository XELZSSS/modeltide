import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium ui-motion ui-press disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-contrast hoverable:hover:bg-accent/90 border border-transparent [--press-text:var(--accent-contrast)]",
        outline: "border border-border text-text-primary hoverable:hover:border-text-primary",
        ghost: "text-text-primary hoverable:hover:bg-hover",
      },
      size: {
        // Touch first: the mobile sizes keep every control at or above 40px, and `md:h-8`/`md:h-9` restore the
        // desktop density the tables and toolbars were designed around.
        sm: "h-10 px-3 text-sm md:h-8 md:text-xs",
        md: "h-10 px-4 text-sm md:h-9",
        icon: "size-10 md:size-9",
      },
    },
    defaultVariants: { variant: "ghost", size: "sm" },
  },
);

export type ButtonVariant = "primary" | "outline" | "ghost";
export type ButtonSize = "sm" | "md" | "icon";
