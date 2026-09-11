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
      <CardContent className="flex flex-col items-center justify-center gap-1.5 py-4 text-center sm:p-4">
        <div className="flex items-center justify-center gap-1.5 min-w-0 max-w-full">
          {Icon && (
            <span className="text-accent shrink-0" aria-hidden="true">
              <Icon className="size-4" />
            </span>
          )}
          <p className="ui-caption font-medium truncate">{label}</p>
        </div>
        <div className="ui-mono-value text-xl font-semibold tracking-tight break-words min-w-0">{value}</div>
      </CardContent>
    </Card>
  );
});
