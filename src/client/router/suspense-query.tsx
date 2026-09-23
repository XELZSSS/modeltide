import { usePathname } from "@/client/router";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { ContractSkewNotice, EmptyState, Spinner } from "@/client/components/feedback";
import { useTranslation } from "@/client/providers";
import { Component, Fragment, Suspense, type ErrorInfo, type ReactNode } from "react";
import { QueryErrorResetBoundary, useQueryClient } from "@tanstack/react-query";

interface ErrorBoundaryProps {
  errorTitle?: string;
  retryLabel?: string;
  offlineMessage?: string;
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
  private handleOnline = () => {
    this.forceUpdate();
  };
  override componentDidMount() {
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOnline);
  }
  override componentWillUnmount() {
    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("offline", this.handleOnline);
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
        <div className="flex flex-col items-center gap-3">
          <EmptyState variant="error" icon={TriangleAlert} title={title} message={this.state.error?.message ?? retry} />
          {offline && (
            <p className="ui-caption" role="status">
              {this.props.offlineMessage ?? "Offline — reconnect and reload to retry"}
            </p>
          )}
          <Button variant="outline" size="sm" onClick={this.handleRetry} disabled={offline}>
            {retry}
          </Button>
        </div>
      );
    }
    return <Fragment key={String(this.state.resetKey)}>{this.props.children}</Fragment>;
  }
}

/** Shell-level recovery for failures outside a view's own SuspenseQuery: a 200 can still cache a
 *  malformed payload, so the active queries must be reset, not just the error state. */
export function QueryResetErrorBoundary(props: Omit<ErrorBoundaryProps, "onReset">) {
  const queryClient = useQueryClient();
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          {...props}
          onReset={() => {
            reset();
            void queryClient.resetQueries();
          }}
        >
          {props.children}
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

export function SuspenseQuery({ children, resetKey: extraKey }: { children: ReactNode; resetKey?: string }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  // Route (+ the caller's view key) resets the subtree; query params must stay out, since every
  // param is `tab`/`view` state owned by a component inside the boundary.
  const resetKey = `${pathname}${extraKey ? `:${extraKey}` : ""}`;
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          key={resetKey}
          errorTitle={t("errorBoundaryTitle")}
          retryLabel={t("errorBoundaryRetry")}
          offlineMessage={t("offlineRetry")}
          onReset={reset}
        >
          <ContractSkewNotice />
          <Suspense fallback={<Spinner />}>{children}</Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
