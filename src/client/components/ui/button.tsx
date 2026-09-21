"use client";
import { memo, type Ref } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/client/utils/cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors duration-fast disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-contrast hoverable:hover:bg-accent/90 border border-transparent",
        outline: "border border-border bg-transparent text-text-primary hoverable:hover:border-text-primary",
        ghost: "text-text-primary hoverable:hover:bg-hover",
      },
      size: {
        sm: "h-8 px-3 text-xs rounded-none",
        md: "h-9 px-4 text-sm rounded-none",
        icon: "size-9 rounded-none",
      },
    },
    defaultVariants: { variant: "ghost", size: "sm" },
  },
);

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  ref?: Ref<HTMLButtonElement>;
}

export const Button = memo(function Button({
  variant,
  size,
  type = "button",
  className,
  children,
  disabled,
  ref,
  ...props
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {children}
    </button>
  );
});
