"use client";
import { memo } from "react";
import { cn } from "@/client/utils/cn";

export const Card = memo(function Card({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("ui-card", className)} {...props}>
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
    <div className={cn("w-full min-w-0 p-5 sm:p-6", className)} {...props}>
      {children}
    </div>
  );
});

export const CardHeader = memo(function CardHeader({
  title,
  subtitle,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  className?: string;
}) {
  if (subtitle == null || subtitle === "") {
    return <p className={cn("ui-card-title mb-4 border-b border-border pb-3", className)}>{title}</p>;
  }
  return (
    <div className={cn("min-w-0 border-b border-border pb-3 mb-4", className)}>
      <p className="ui-card-title mb-1">{title}</p>
      <p className="ui-caption">{subtitle}</p>
    </div>
  );
});
