"use client";
import { SafeLink as Link, usePathname, useRouter, useSearchParams } from "@/client/router";
import { ArrowLeft, TriangleAlert, type LucideIcon, Loader2 } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
import { useTranslation } from "@/client/providers";
import type { TranslationKey } from "@/shared/i18n";
import { Component, Fragment, type ReactNode, type ErrorInfo, memo, Suspense } from "react";
import { PageContainer } from "@/client/components/layout";
import { QueryErrorResetBoundary } from "@tanstack/react-query";

export function BackButton({ labelKey, to }: { labelKey: TranslationKey; to: string }) {
  const router = useRouter();
  const { t } = useTranslation();
  const goBack = () => {
    const raw = typeof window !== "undefined" ? (window.history.state as { idx?: unknown } | null)?.idx : undefined;
    const idx = typeof raw === "number" && Number.isInteger(raw) ? raw : undefined;
    if (idx != null && idx > 0) router.back();
    // Fallback replaces instead of pushing: no extra history entry when the
    // user landed here directly (deep link, reload, new tab).
    else router.replace(to);
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
  compact,
}: {
  icon?: LucideIcon;
  message: string;
  title?: string;
  variant?: "empty" | "error";
  compact?: boolean;
}) {
  return (
    <Card
      className={
        compact
          ? "flex flex-col items-center justify-center gap-2 p-6 text-center"
          : "flex flex-col items-center justify-center gap-3 p-10 text-center min-h-[240px]"
      }
      role={variant === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      {Icon && <Icon size={compact ? 24 : 32} className="opacity-50 text-text-tertiary" aria-hidden="true" />}
      {title ? <p className="ui-card-title text-center text-text-primary">{title}</p> : null}
      <p className="ui-body-secondary text-center text-balance max-w-md">{message}</p>
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
  override state: ErrorBoundaryState = { hasError: false, error: null, resetKey: 0 };
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }
  private handleRetry = () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    this.props.onReset?.();
    this.setState((s) => ({ hasError: false, error: null, resetKey: s.resetKey + 1 }));
  };
  override render() {
    if (this.state.hasError) {
      const title = this.props.errorTitle ?? "Error";
      const retry = this.props.retryLabel ?? "Retry";
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      return (
        <Card className="flex flex-col items-center justify-center gap-3 min-h-[240px] p-8 text-center" role="alert">
          <TriangleAlert size={28} className="text-destructive opacity-80" aria-hidden="true" />
          <p className="ui-card-title text-destructive">{title}</p>
          <p className="ui-caption max-w-md text-balance">{this.state.error?.message}</p>
          {offline && (
            <p className="ui-caption" role="status">
              Offline — reconnect and reload to retry
            </p>
          )}
          <Button variant="outline" size="sm" onClick={this.handleRetry} disabled={offline}>
            {retry}
          </Button>
        </Card>
      );
    }
    return <Fragment key={String(this.state.resetKey)}>{this.props.children}</Fragment>;
  }
}

export function NotFound() {
  const { t } = useTranslation();
  return (
    <PageContainer>
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center animate-fade-in">
        <div className="border border-border bg-bg-secondary px-4 py-2 text-4xl sm:text-5xl font-semibold tabular-nums text-text-tertiary">
          404
        </div>
        <h1 className="ui-section-title">{t("notFoundTitle")}</h1>
        <p className="ui-body-secondary max-w-md text-balance">{t("notFound")}</p>
        <Link
          href="/"
          className="mt-2 inline-flex items-center justify-center gap-1.5 h-9 px-4 text-sm font-medium rounded-none bg-accent text-accent-contrast hover:bg-accent/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      <Loader2 className="size-7 animate-spin text-accent" aria-hidden="true" />
      <span className="sr-only">{t("loading")}</span>
    </div>
  );
});

export const Skeleton = memo(function Skeleton({ className, lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div className={className} role="status" aria-live="polite" aria-label="loading">
      <div className="flex flex-col gap-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="ui-skeleton h-16 w-full border border-border" style={{ opacity: 1 - i * 0.15 }} />
        ))}
        <span className="sr-only">loading</span>
      </div>
    </div>
  );
});

export function PartialNotice({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="flex items-center gap-1.5 border border-warning/30 bg-warning-light px-3 py-2 ui-caption text-text-secondary"
    >
      <TriangleAlert size={14} className="shrink-0 text-warning" aria-hidden="true" />
      <span className="min-w-0">{message}</span>
    </div>
  );
}

export function SuspenseQuery({ children, resetKey: extraKey }: { children: ReactNode; resetKey?: string }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const resetKey = `${pathname}?${searchParams.toString()}${extraKey ? `:${extraKey}` : ""}`;
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
