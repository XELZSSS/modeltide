import { useNavigate, Link, useLocation } from "react-router";
import { ArrowLeft, type LucideIcon, Loader2 } from "lucide-react";
import { Button, Card } from "@/client/components/ui";
import { useTranslation } from "@/client/providers";
import type { TranslationKey } from "@/shared/i18n";
import { Component, Fragment, type ReactNode, type ErrorInfo, memo, Suspense } from "react";
import { PageContainer } from "@/client/components/layout";
import { QueryErrorResetBoundary } from "@tanstack/react-query";

// ---- BackButton ----
/**
 * Back navigation preferring browser history (preserves ?tab=/scroll/filter),
 * falling back to `to` on deep links. Forwards router state on fallback.
 */
export function BackButton({ labelKey, to, state }: { labelKey: TranslationKey; to: string; state?: unknown }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const goBack = () => {
    // React Router increments history.idx per SPA navigation; a fresh deep
    // link starts at 0. document.referrer is unreliable inside an SPA
    // (client-side <Link> transitions don't update it), so idx alone decides.
    const raw = typeof window !== "undefined" ? (window.history.state as { idx?: unknown } | null)?.idx : undefined;
    const idx = typeof raw === "number" && Number.isInteger(raw) ? raw : undefined;
    if (idx != null && idx > 0) navigate(-1);
    else navigate(to, { state });
  };
  return (
    <Button size="sm" variant="outline" onClick={goBack} className="self-start">
      <ArrowLeft className="size-4" /> {t(labelKey)}
    </Button>
  );
}

// ---- EmptyState ----
/** Empty-state card: optional muted icon plus explanation. */
export function EmptyState({ icon: Icon, message }: { icon?: LucideIcon; message: string }) {
  return (
    <Card
      className="flex flex-col items-center justify-center gap-3 p-10 text-text-secondary"
      role="status"
      aria-live="polite"
    >
      {Icon && <Icon size={32} className="opacity-50" aria-hidden="true" />}
      <p className="ui-body-secondary text-center">{message}</p>
    </Card>
  );
}

// ---- ErrorBoundary ----
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
  // Remount children from scratch on retry; let suspended queries retry too.
  // Offline retries always fail (Vite caches the rejected chunk import), so
  // guide the user to reload once instead of looping.
  private handleRetry = () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    this.props.onReset?.();
    this.setState((s) => ({ hasError: false, error: null, resetKey: s.resetKey + 1 }));
  };
  render() {
    if (this.state.hasError) {
      const title = this.props.errorTitle ?? "Error";
      const retry = this.props.retryLabel ?? "Retry";
      return (
        <div className="flex flex-col items-center justify-center gap-3 min-h-[240px] p-6 text-center">
          <p className="ui-card-title text-destructive">{title}</p>
          <p className="ui-caption">{this.state.error?.message}</p>
          <Button variant="link" size="sm" onClick={this.handleRetry}>
            {retry}
          </Button>
        </div>
      );
    }
    return <Fragment key={String(this.state.resetKey)}>{this.props.children}</Fragment>;
  }
}

// ---- NotFound ----
/** 404 page with a link back to the home route. */
export function NotFound() {
  const { t } = useTranslation();
  return (
    <PageContainer>
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="text-4xl sm:text-5xl font-semibold text-text-tertiary">404</div>
        <h1 className="ui-section-title">{t("notFoundTitle")}</h1>
        <p className="ui-body-secondary">{t("notFound")}</p>
        <Link
          to="/"
          className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-accent rounded-none hover:bg-accent-light transition-colors"
        >
          <ArrowLeft size={14} />
          {t("backToHome")}
        </Link>
      </div>
    </PageContainer>
  );
}

// ---- Spinner ----
/** Centered loading spinner. */
export const Spinner = memo(function Spinner() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
      <Loader2 className="size-7 animate-spin text-text-secondary" aria-hidden="true" />
      <span className="sr-only">{t("loading")}</span>
    </div>
  );
});

// ---- SuspenseQuery ----
/** Suspense fallback + error boundary, keyed by route (navigation resets failures). */
export function SuspenseQuery({ children, resetKey: extraKey }: { children: ReactNode; resetKey?: string }) {
  const { t } = useTranslation();
  const location = useLocation();
  const resetKey = `${location.pathname}${location.search}${extraKey ? `:${extraKey}` : ""}`;
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
