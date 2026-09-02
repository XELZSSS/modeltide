import { useNavigate, Link, useLocation } from "react-router";
import { ArrowLeft, type LucideIcon, Loader2 } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
import { useTranslation } from "@/client/providers";
import type { TranslationKey } from "@/shared/i18n";
import { Component, Fragment, type ReactNode, type ErrorInfo, memo, Suspense } from "react";
import { PageContainer } from "@/client/components/layout";
import { QueryErrorResetBoundary } from "@tanstack/react-query";

export function BackButton({ labelKey, to, state }: { labelKey: TranslationKey; to: string; state?: unknown }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const goBack = () => {
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

export function EmptyState({
  icon: Icon,
  message,
  title,
  variant = "empty",
}: {
  icon?: LucideIcon;
  message: string;
  title?: string;
  variant?: "empty" | "error";
}) {
  return (
    <Card
      className="flex flex-col items-center justify-center gap-3 p-10 text-text-secondary min-h-[240px]"
      role={variant === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      {Icon && <Icon size={32} className="opacity-50" aria-hidden="true" />}
      {title ? <p className="ui-card-title text-center">{title}</p> : null}
      <p className="ui-body-secondary text-center">{message}</p>
    </Card>
  );
}

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
  private handleRetry = () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    this.props.onReset?.();
    this.setState((s) => ({ hasError: false, error: null, resetKey: s.resetKey + 1 }));
  };
  render() {
    if (this.state.hasError) {
      const title = this.props.errorTitle ?? "Error";
      const retry = this.props.retryLabel ?? "Retry";
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      return (
        <div className="flex flex-col items-center justify-center gap-3 min-h-[240px] p-6 text-center">
          <p className="ui-card-title text-destructive">{title}</p>
          <p className="ui-caption">{this.state.error?.message}</p>
          {offline && (
            <p className="ui-caption" role="status">
              Offline — reconnect and reload to retry
            </p>
          )}
          <Button variant="link" size="sm" onClick={this.handleRetry} disabled={offline}>
            {retry}
          </Button>
        </div>
      );
    }
    return <Fragment key={String(this.state.resetKey)}>{this.props.children}</Fragment>;
  }
}

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
          className="mt-2 inline-flex items-center justify-center gap-1.5 h-9 px-4 text-sm font-medium rounded-none border border-border text-text-primary hover:bg-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <ArrowLeft size={14} />
          {t("backToHome")}
        </Link>
      </div>
    </PageContainer>
  );
}

export const Spinner = memo(function Spinner() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
      <Loader2 className="size-7 animate-spin text-text-secondary" aria-hidden="true" />
      <span className="sr-only">{t("loading")}</span>
    </div>
  );
});

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
