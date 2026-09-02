import { memo } from "react";
import { cn } from "@/client/utils";

/**
 * Card container. Content surfaces use square corners; rounded corners are
 * reserved for interactive controls and floating overlays (buttons, tabs,
 * inputs, badges, sheets).
 */
export const Card = memo(function Card({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("border border-border bg-bg-card shadow-xs", className)} {...props}>
      {children}
    </div>
  );
});

interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: "sm" | "md";
}

export const CardContent = memo(function CardContent({
  className,
  children,
  padding = "md",
  ...props
}: CardContentProps) {
  return (
    <div
      className={cn("w-full min-w-0", padding === "sm" && "p-3.5 sm:p-4", padding === "md" && "p-4 sm:p-5", className)}
      {...props}
    >
      {children}
    </div>
  );
});
