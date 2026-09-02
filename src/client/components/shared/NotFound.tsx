import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@/client/providers";
import { PageContainer } from "@/client/components/layout";

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
