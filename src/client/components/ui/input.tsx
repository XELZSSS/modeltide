"use client";
import { forwardRef } from "react";
import { cn } from "@/client/utils/cn";

const noSpinners =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

export const Input = forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">>(
  function Input({ className, type, "aria-invalid": ariaInvalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        aria-invalid={ariaInvalid}
        className={cn(
          "h-9 px-3 min-w-0 max-w-full text-base sm:text-sm rounded-none border border-border bg-bg-primary text-text-primary placeholder:text-text-tertiary outline-none transition-colors focus:border-text-tertiary",
          type === "number" && noSpinners,
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
