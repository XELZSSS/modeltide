"use client";
import { memo } from "react";
import { cn } from "@/client/utils/cn";

export const Card = memo(function Card({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("border border-border bg-bg-card shadow-none", className)} {...props}>
      {children}
    </div>
  );
});

export const CardHeader = memo(function CardHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center justify-between gap-2 px-4 pt-4 sm:px-5", className)} {...props}>
      {children}
    </div>
  );
});

export const CardContent = memo(function CardContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("w-full min-w-0 p-4 sm:p-5", className)} {...props}>
      {children}
    </div>
  );
});
