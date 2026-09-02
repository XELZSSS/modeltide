import { Card } from "@/client/components/ui";
import type { LucideIcon } from "lucide-react";

/** Shared empty-state card: an optional muted icon plus a short explanation. */
export function EmptyState({ icon: Icon, message }: { icon?: LucideIcon; message: string }) {
  return (
    <Card
      className="flex flex-col items-center justify-center p-8 text-text-secondary"
      role="status"
      aria-live="polite"
    >
      {Icon && <Icon size={24} className="mb-2 opacity-50" />}
      <p className="text-sm">{message}</p>
    </Card>
  );
}
