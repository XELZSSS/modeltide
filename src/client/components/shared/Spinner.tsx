import { memo } from "react";
import { Loader2 } from "lucide-react";

/** Centered loading spinner. */
export const Spinner = memo(function Spinner() {
  return (
    <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
      <Loader2 className="size-6 animate-spin text-text-secondary" />
    </div>
  );
});
