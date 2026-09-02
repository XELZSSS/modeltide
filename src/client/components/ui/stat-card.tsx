import { memo, type ComponentType, type ReactNode } from "react";
import { Card, CardContent } from "./card";

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
}

/** Compact metric card used in stat grids. */
export const StatCard = memo(function StatCard({ label, value, icon: Icon, className }: StatCardProps) {
  return (
    <Card className={className}>
      <CardContent padding="sm" className="text-center">
        <div className="flex items-center justify-center gap-1.5 mb-1.5 min-w-0">
          {Icon && (
            <span className="text-text-tertiary shrink-0">
              <Icon className="size-3.5" />
            </span>
          )}
          <p className="text-[11px] sm:text-xs text-text-tertiary font-medium truncate">{label}</p>
        </div>
        <p className="text-lg sm:text-xl font-semibold tracking-tight break-words min-w-0">{value}</p>
      </CardContent>
    </Card>
  );
});
