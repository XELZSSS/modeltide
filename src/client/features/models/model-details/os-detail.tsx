import { useTranslation } from "@/client/providers";
import type { TranslationKey } from "@/shared/i18n";
import type { OpenSourceModelEntry } from "@/shared/types";
import { formatDate, formatShortNumber, orNA } from "@/client/utils/format";
import { DetailLayout, DetailSection, InfoGrid, StatGrid } from "@/client/components/ui/grids";
import { Badge, InfoCard, InfoRow } from "@/client/components/ui/primitives";
import { StatCard } from "@/client/components/ui/stat-card";

export function OsDetail({ model }: { model: OpenSourceModelEntry }) {
  const { t, lang } = useTranslation();
  const dateRows: [TranslationKey, string | null][] = [
    ["releaseDate", model.createdAt],
    ["lastUpdated", model.lastModified],
  ];
  return (
    <DetailLayout>
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
              className="text-sm text-accent hover:underline break-all"
            >
              {model.id}
            </a>
          ) : (
            <span className="text-sm text-text-tertiary">{t("notAvailable")}</span>
          )}
        </InfoCard>
      </InfoGrid>
      {(model.tags ?? []).length > 0 && (
        <DetailSection title={t("tags")}>
          <div className="flex flex-wrap gap-2">
            {(model.tags ?? []).map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
        </DetailSection>
      )}
    </DetailLayout>
  );
}
