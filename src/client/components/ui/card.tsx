"use client";
import { memo, type ReactNode } from "react";
import { cn } from "@/client/utils/cn";

export const Card = memo(function Card({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("border border-border bg-bg-card", className)} {...props}>
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
      className={cn("w-full min-w-0", padding === "sm" && "p-4", padding === "md" && "p-4 sm:p-5", className)}
      {...props}
    >
      {children}
    </div>
  );
});

export const ExpandedRow = memo(function ExpandedRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("p-4 sm:p-5", className)}>{children}</div>;
});
