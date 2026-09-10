"use client";
import { memo, type Ref } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/client/utils/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-contrast hover:bg-accent/90",
        outline: "border border-border text-text-primary hover:bg-hover",
        ghost: "text-text-primary hover:bg-hover",
        link: "text-text-primary underline-offset-4 hover:underline",
        destructive: "bg-destructive text-destructive-contrast hover:bg-destructive/90",
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
