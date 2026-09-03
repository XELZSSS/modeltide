import { useNavigate, Link, useLocation } from "react-router";
import { ArrowLeft, type LucideIcon, Loader2 } from "lucide-react";
import { Button, Card } from "@/client/components/ui";
import { useTranslation } from "@/client/providers";
import type { TranslationKey } from "@/shared/i18n";
import { Component, Fragment, type ReactNode, type ErrorInfo, memo, Suspense } from "react";
import { PageContainer } from "@/client/components/layout";
import { QueryErrorResetBoundary } from "@tanstack/react-query";

// ---- client/components/shared/BackButton.tsx ----
/**
 * Back navigation that prefers the browser history (preserving ?tab=, scroll and
 * filter state) and falls back to pushing `to` when there is no in-app history
 * (deep link, new tab). Optional router state is forwarded on the fallback path.
 */
export function BackButton({ labelKey, to, state }: { labelKey: TranslationKey; to: string; state?: unknown }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const goBack = () => {
    // Prefer in-app history (preserves ?tab=/scroll/filter). The idx check alone
    // can't tell internal from external entries, so require a same-origin
    // referrer as well before going back; otherwise push `to`.
    const idx = typeof window !== "undefined" ? (window.history.state as { idx?: number } | null)?.idx : undefined;
    const ref = typeof document !== "undefined" ? document.referrer : "";
    let sameOriginRef = false;
    try {
      sameOriginRef = !!ref && new URL(ref).origin === window.location.origin;
    } catch {
      sameOriginRef = false;
    }
    if (typeof idx === "number" && idx > 0 && sameOriginRef) navigate(-1);
    else navigate(to, { state });
  };
  return (
    <Button size="sm" variant="outline" onClick={goBack} className="self-start">
      <ArrowLeft className="size-4" /> {t(labelKey)}
    </Button>
  );
}

// ---- client/components/shared/EmptyState.tsx ----
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

// ---- client/components/shared/ErrorBoundary.tsx ----
interface ErrorBoundaryProps {
  errorTitle?: string;
  retryLabel?: string;
  children: ReactNode;
  onReset?: () => void;
}
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  resetKey: number;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  static displayName = "ErrorBoundary";
  state: ErrorBoundaryState = { hasError: false, error: null, resetKey: 0 };
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }
  // Bump resetKey so children are remounted from scratch on retry.
  // Also notifies QueryErrorResetBoundary so suspended queries can retry.
  private handleRetry = () => {
    this.props.onReset?.();
    this.setState((s) => ({ hasError: false, error: null, resetKey: s.resetKey + 1 }));
  };
  render() {
    if (this.state.hasError) {
      const title = this.props.errorTitle ?? "Error";
      const retry = this.props.retryLabel ?? "Retry";
      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] gap-2 p-4">
          <p className="text-sm font-semibold text-destructive">{title}</p>
          <p className="text-xs text-text-secondary">{this.state.error?.message}</p>
          <Button variant="link" size="sm" onClick={this.handleRetry}>
            {retry}
          </Button>
        </div>
      );
    }
    return <Fragment key={String(this.state.resetKey)}>{this.props.children}</Fragment>;
  }
}

// ---- client/components/shared/NotFound.tsx ----
/** 404 page with a link back to the home route. */
export function NotFound() {
  const { t } = useTranslation();
  return (
    <PageContainer>
      <div className="flex flex-col items-center justify-center py-20">
        <div className="text-5xl font-semibold text-text-tertiary mb-4">404</div>
        <h1 className="text-xl font-semibold text-text-primary">{t("notFoundTitle")}</h1>
        <p className="mt-2 text-sm text-text-secondary">{t("notFound")}</p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-accent rounded-md hover:bg-accent-light transition-colors"
        >
          <ArrowLeft size={14} />
          {t("backToHome")}
        </Link>
      </div>
    </PageContainer>
  );
}

// ---- client/components/shared/Spinner.tsx ----
/** Centered loading spinner. */
export const Spinner = memo(function Spinner() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
      <Loader2 className="size-6 animate-spin text-text-secondary" aria-hidden="true" />
      <span className="sr-only">{t("loading")}</span>
    </div>
  );
});

// ---- client/components/shared/SuspenseQuery.tsx ----
/**
 * Wraps async data components with a Suspense fallback and an error boundary.
 * The boundary is keyed by route so navigation resets any failed state.
 * QueryErrorResetBoundary ensures query errors are reset on retry.
 */
export function SuspenseQuery({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const location = useLocation();
  // Include the search string so ?tab= switches reset a failed boundary.
  const resetKey = `${location.pathname}${location.search}`;
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          key={resetKey}
          errorTitle={t("errorBoundaryTitle")}
          retryLabel={t("errorBoundaryRetry")}
          onReset={reset}
        >
          <Suspense fallback={<Spinner />}>{children}</Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
