import { Suspense, type ReactNode } from "react";
import { useLocation } from "react-router";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { useTranslation } from "@/client/providers";
import { ErrorBoundary } from "./ErrorBoundary";
import { Spinner } from "./Spinner";

/**
 * Wraps async data components with a Suspense fallback and an error boundary.
 * The boundary is keyed by route so navigation resets any failed state.
 * QueryErrorResetBoundary ensures query errors are reset on retry.
 */
export function SuspenseQuery({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const location = useLocation();
  return (
    <QueryErrorResetBoundary>
      <ErrorBoundary key={location.pathname} errorTitle={t("errorBoundaryTitle")} retryLabel={t("errorBoundaryRetry")}>
        <Suspense fallback={<Spinner />}>{children}</Suspense>
      </ErrorBoundary>
    </QueryErrorResetBoundary>
  );
}
