import { memo, type ReactNode } from "react";
import { cn } from "@/client/utils";

/** Small outlined label chip. */
export const Badge = memo(function Badge({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-xs font-medium leading-[18px] px-2 py-0.5 rounded-full transition-colors border border-border text-text-secondary bg-transparent",
        className,
      )}
    >
      {children}
    </span>
  );
});
