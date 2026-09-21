"use client";
import { forwardRef } from "react";
import { cn } from "@/client/utils/cn";

export const Input = forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">>(
  function Input({ className, type, "aria-invalid": ariaInvalid, disabled, ...props }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        aria-invalid={ariaInvalid}
        disabled={disabled}
        className={cn(
          "h-9 px-3 min-w-0 max-w-full text-base sm:text-sm border border-border bg-bg-primary text-text-primary placeholder:text-text-tertiary outline-none transition-colors duration-fast hoverable:hover:border-text-tertiary/40 focus:border-accent/60 focus:ring-2 focus:ring-ring/30 disabled:opacity-50 disabled:bg-bg-secondary",
          ariaInvalid && "border-destructive focus:border-destructive focus:ring-destructive/30",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
