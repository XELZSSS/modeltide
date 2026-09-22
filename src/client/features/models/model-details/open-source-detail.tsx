import { useTranslation } from "@/client/providers";
import type { TranslationKey } from "@/shared/i18n";
import type { OpenSourceModelEntry } from "@/shared/types";
import { formatDate, formatShortNumber, orNA } from "@/client/utils/format";
import { shortModelId } from "@/client/utils/model-utils";
import { InfoGrid, StatGrid } from "@/client/components/ui/grids";
import { PageSection } from "@/client/components/layout";
import { Badge, InfoCard, InfoRow } from "@/client/components/ui/primitives";
import { StatCard } from "@/client/components/ui/stat-card";
import { NotFound } from "@/client/components/feedback";
import { useSuspenseOpenSourceModel } from "@/client/api/api-queries";
import { DetailShell } from "./detail-views";

function OsDetail({ model }: { model: OpenSourceModelEntry }) {
  const { t, lang } = useTranslation();
  const dateRows: [TranslationKey, string | null][] = [
    ["releaseDate", model.createdAt],
    ["lastUpdated", model.lastModified],
  ];
  return (
    <div className="flex flex-col gap-4">
      <StatGrid columns={2}>
        <StatCard label={t("downloads")} value={formatShortNumber(model.downloads)} />
        <StatCard label={t("likes")} value={formatShortNumber(model.likes)} />
      </StatGrid>
      <InfoGrid>
        <InfoCard title={t("modelInfo")}>
          <InfoRow label={t("creator")} value={orNA(model.author, t)} />
          <InfoRow label={t("license")} value={orNA(model.license, t)} />
          <InfoRow label={t("task")} value={orNA(model.task, t)} />
          {dateRows.map(([labelKey, value]) => (
            <InfoRow key={labelKey} label={t(labelKey)} value={value ? formatDate(value, lang) : t("notAvailable")} />
          ))}
        </InfoCard>
        <InfoCard title={t("repository")}>
          {model.id ? (
            <a
              href={`https://huggingface.co/${model.id
                .replace(/^\//, "")
                .split("/")
                .map((seg) => encodeURIComponent(seg))
                .join("/")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent break-all underline-offset-4 transition-colors duration-fast hoverable:hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              {model.id}
            </a>
          ) : (
            <span className="text-sm text-text-tertiary">{t("notAvailable")}</span>
          )}
        </InfoCard>
      </InfoGrid>
      {(model.tags ?? []).length > 0 && (
        <PageSection title={t("tags")}>
          <div className="flex flex-wrap gap-2">
            {(model.tags ?? []).map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
        </PageSection>
      )}
    </div>
  );
}

export const OSDetail = function OSDetail({ decodedId }: { decodedId: string }) {
  const model = useSuspenseOpenSourceModel(decodedId);
  if (!model) return <NotFound />;
  return (
    <DetailShell source="os" title={shortModelId(model.id)}>
      <OsDetail model={model} />
    </DetailShell>
  );
};
