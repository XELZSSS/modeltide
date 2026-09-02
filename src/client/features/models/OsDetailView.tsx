import { useTranslation } from "@/client/providers";
import {
  StatCard,
  InfoCard,
  InfoRow,
  DetailLayout,
  DetailSection,
  StatGrid,
  InfoGrid,
  Badge,
} from "@/client/components/ui";
import { formatShortNumber, formatDate, orNA } from "@/client/utils";
import type { OpenSourceModelEntry } from "@/shared/types";

/** Open-source model detail body (Hugging Face metadata + repository link). */
export function OsDetail({ model }: { model: OpenSourceModelEntry }) {
  const { t, lang } = useTranslation();
  return (
    <DetailLayout>
      <StatGrid columns={2}>
        <StatCard label={t("downloads")} value={formatShortNumber(model.downloads)} />
        <StatCard label={t("likes")} value={formatShortNumber(model.likes)} />
      </StatGrid>
      <InfoGrid>
        <InfoCard title={t("modelInfo")}>
          <InfoRow compact label={t("creator")} value={orNA(model.author, t)} />
          <InfoRow compact label={t("license")} value={orNA(model.license, t)} />
          <InfoRow compact label={t("task")} value={orNA(model.task, t)} />
          <InfoRow
            compact
            label={t("releaseDate")}
            value={model.createdAt ? formatDate(model.createdAt, lang) : t("notAvailable")}
          />
          <InfoRow
            compact
            label={t("lastUpdated")}
            value={model.lastModified ? formatDate(model.lastModified, lang) : t("notAvailable")}
          />
        </InfoCard>
        <InfoCard title={t("repository")}>
          {/* Hugging Face URLs must not start with a slash, so strip it from the model id. */}
          <a
            href={`https://huggingface.co/${model.id.replace(/^\//, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:underline break-all"
          >
            {model.id}
          </a>
        </InfoCard>
      </InfoGrid>
      {model.tags.length > 0 && (
        <DetailSection title={t("tags")}>
          <div className="flex flex-wrap gap-1.5">
            {model.tags.map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
        </DetailSection>
      )}
    </DetailLayout>
  );
}
