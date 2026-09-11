"use client";
import { memo, type Ref } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/client/utils/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors duration-fast disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary active:translate-y-px",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-contrast hover:bg-accent/90 border border-transparent",
        outline: "border border-border bg-transparent text-text-primary hover:bg-hover hover:border-text-tertiary/40",
        ghost: "text-text-primary hover:bg-hover",
        link: "text-text-primary underline-offset-4 hover:underline px-0",
        destructive: "bg-destructive text-destructive-contrast hover:bg-destructive/90 border border-transparent",
      },
      size: {
        sm: "h-8 px-3 text-xs rounded-none",
        md: "h-9 px-4 text-sm rounded-none",
        icon: "size-9 rounded-none",
        xs: "h-7 px-2 text-xs rounded-none",
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
