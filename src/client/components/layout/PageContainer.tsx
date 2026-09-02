import { type ReactNode } from "react";
import { cn } from "@/client/utils";

/** Centred page wrapper with a max-width and responsive horizontal padding. */
export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6", className)}>{children}</div>;
}
