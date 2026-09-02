import { forwardRef } from "react";
import { cn } from "@/client/utils";

// Hide the native number-input spinners (webkit + Firefox) for a cleaner field.
const noSpinners =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/** Text/number input; number fields have native spinners hidden via `noSpinners`. */
export const Input = forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">>(
  function Input({ className, type, "aria-invalid": ariaInvalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        aria-invalid={ariaInvalid}
        className={cn(
          "h-9 px-3 text-sm rounded-md border border-border bg-bg-primary text-text-primary placeholder:text-text-tertiary outline-none transition-colors focus:border-text-tertiary",
          type === "number" && noSpinners,
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
