"use client";
import { memo, type ReactNode } from "react";
import { cn } from "@/client/utils/cn";

export const Badge = memo(function Badge({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-xs font-medium uppercase tracking-wide leading-5 px-2 py-0.5 rounded-none transition-colors border border-border text-text-secondary bg-transparent",
        className,
      )}
    >
      {children}
    </span>
  );
});

const dotSizeClass = {
  sm: "w-2 h-2",
  md: "w-2.5 h-2.5",
} as const;

export const Dot = memo(function Dot({
  size = "md",
  color,
  className,
}: {
  size?: keyof typeof dotSizeClass;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-block rounded-none shrink-0", dotSizeClass[size], className)}
      style={color ? { backgroundColor: color } : undefined}
    />
  );
});

import { Card, CardContent } from "./card";

export const InfoCard = memo(function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent>
        <p className="ui-card-title mb-4 text-text-primary">{title}</p>
        <div className="flex flex-col gap-2 min-w-0">{children}</div>
      </CardContent>
    </Card>
  );
});

export const InfoRow = memo(function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={cn("flex flex-row justify-between min-w-0 py-1.5 gap-3")}>
      <p className="text-sm text-text-secondary truncate">{label}</p>
      <div className="text-sm font-mono tabular-nums text-right truncate text-text-primary font-medium min-w-0">
        {value}
      </div>
    </div>
  );
});
