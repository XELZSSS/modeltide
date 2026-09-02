import type { Ref } from "react";
import { cn } from "@/client/utils";

type ButtonVariant = "primary" | "outline" | "ghost" | "link" | "destructive";
type ButtonSize = "sm" | "icon" | "md";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Ref to the underlying button element (React 19 ref-as-prop, no forwardRef needed). */
  ref?: Ref<HTMLButtonElement>;
}

const baseClass =
  "inline-flex items-center justify-center whitespace-nowrap font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";

const variantClass: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-contrast hover:bg-accent/90",
  outline: "border border-border text-text-primary hover:bg-hover",
  ghost: "text-text-primary hover:bg-hover",
  link: "text-text-primary underline-offset-4 hover:underline",
  destructive: "bg-destructive text-white hover:bg-destructive/90",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs rounded-md",
  md: "h-9 px-4 text-sm rounded-md",
  icon: "size-9 rounded-md",
};

/** Shared button with variant/size presets; defaults to type="button" (pass type="submit" in forms). */
export function Button({
  variant = "ghost",
  size = "sm",
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
      className={cn(baseClass, variantClass[variant], sizeClass[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}
