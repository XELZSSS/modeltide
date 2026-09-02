import { Component, Fragment, type ReactNode, type ErrorInfo } from "react";
import { Button } from "@/client/components/ui";

interface ErrorBoundaryProps {
  errorTitle?: string;
  retryLabel?: string;
  children: ReactNode;
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
  private handleRetry = () => {
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
