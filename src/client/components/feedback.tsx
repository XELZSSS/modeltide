import { SafeLink as Link } from "@/client/router";
import { ArrowLeft, TriangleAlert, type LucideIcon, Loader2 } from "lucide-react";
import { buttonVariants } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
import { hasContractSkew, subscribeContractSkew } from "@/client/api/api-client";
import { useTranslation } from "@/client/providers";
import { memo, type ReactNode, useSyncExternalStore } from "react";
import { PageContainer } from "@/client/components/layout";
import { cn } from "@/client/utils/cn";

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
    >
      {Icon && <Icon size={compact ? 24 : 32} className="opacity-50 text-text-tertiary" aria-hidden="true" />}
      {title ? <p className="ui-card-title text-center text-text-primary">{title}</p> : null}
      <p className="ui-body-secondary text-center text-balance max-w-md">{message}</p>
    </Card>
  );
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
        <Link href="/" className={cn("mt-2", buttonVariants({ variant: "primary", size: "md" }))}>
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

function Notice({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="mb-3 flex items-center gap-1.5 border border-warning/30 bg-warning-light px-3 py-2 ui-caption text-text-secondary"
    >
      <TriangleAlert size={14} className="shrink-0 text-warning" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export function PartialNotice({ message }: { message?: string }) {
  const { t } = useTranslation();
  return <Notice>{message ?? t("partialDataNotice")}</Notice>;
}

const neverSkewed = () => false;

export function ContractSkewNotice() {
  const { t } = useTranslation();
  const stale = useSyncExternalStore(subscribeContractSkew, hasContractSkew, neverSkewed);
  if (!stale) return null;
  return <Notice>{t("contractSkewNotice")}</Notice>;
}

export function CenteredPageState({ children }: { children: ReactNode }) {
  return (
    <PageContainer>
      <div className="flex flex-col gap-3 items-center py-16 text-center animate-fade-in">{children}</div>
    </PageContainer>
  );
}
