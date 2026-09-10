"use client";
import { memo, type ComponentType, type ReactNode } from "react";
import { Card, CardContent } from "@/client/components/ui/card";

export const StatCard = memo(function StatCard({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string;
  value: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="text-center sm:p-4">
        <div className="flex items-center justify-center gap-1.5 mb-2 min-w-0">
          {Icon && (
            <span className="text-text-tertiary shrink-0">
              <Icon className="size-4" />
            </span>
          )}
          <p className="text-xs text-text-tertiary font-medium truncate">{label}</p>
        </div>
        <div className="text-xl font-semibold tracking-tight break-words min-w-0">{value}</div>
      </CardContent>
    </Card>
  );
});
