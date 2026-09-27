import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors duration-fast disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-contrast hoverable:hover:bg-accent/90 border border-transparent",
        outline: "border border-border text-text-primary hoverable:hover:border-text-primary",
        ghost: "text-text-primary hoverable:hover:bg-hover",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4 text-sm",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "ghost", size: "sm" },
  },
);

export type ButtonVariant = "primary" | "outline" | "ghost";
export type ButtonSize = "sm" | "md" | "icon";
