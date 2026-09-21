import { isoDate, byDateDesc } from "@/server/parsers/parser-primitives";
import { upstreamConfig } from "@/server/config";
import type { ArtificialAnalysisModel, ClosedReleaseEntry } from "@/shared/types";

import type { ChangelogModel } from "@/server/parsers/aa";
import { dedupeBy } from "@/shared/utils";

// NOTE: deliberately no open/closed classification. Upstream only publishes
// `isOpenWeights` for the top rows of its tables (32 index / 25 openness page /
// 28 models page) and never for the 656-row catalog or the changelog itself —
// 67/275 changelog coverage, so any split would mislabel ~2/3 of the rows as
// closed (Qwen, DeepSeek, Granite, MiniCPM, Ling …). A release is a release;
// the client merges this leg with the Hugging Face open-source feed.

function toClosedEntry(id: unknown, model: unknown, provider: unknown, rawDate: unknown): ClosedReleaseEntry | null {
  if (typeof id !== "string" || typeof model !== "string" || typeof provider !== "string") return null;
  const cleanId = id.trim();
  const cleanModel = model.trim();
  const cleanProvider = provider.trim();
  if (!cleanId || !cleanModel || !cleanProvider) return null;
  if (cleanId.length > 500 || cleanModel.length > 500 || cleanProvider.length > 200) return null;
  if (typeof rawDate !== "string") return null;
  const date = rawDate.slice(0, 10);
  if (!isoDate(date)) return null;
  return {
    id: cleanId,
    model: cleanModel,
    provider: cleanProvider,
    releaseDate: date,
    link: `${upstreamConfig.artificialAnalysis}/models/${encodeURIComponent(cleanId)}`,
  };
}

function toClosedRelease(e: ChangelogModel): ClosedReleaseEntry | null {
  return toClosedEntry(e.releaseSlug, e.releaseName, e.creatorName, e.releaseDate);
}

function toClosedReleaseFromIndex(m: unknown): ClosedReleaseEntry | null {
  if (m === null || typeof m !== "object") return null;
  const rec = m as Partial<ArtificialAnalysisModel>;
  const slug = typeof rec.slug === "string" ? rec.slug : typeof rec.id === "string" ? rec.id : "";
  const name = typeof rec.name === "string" ? rec.name : "";
  const creator = typeof rec.model_creators?.name === "string" ? rec.model_creators.name : "Unknown";
  const date = typeof rec.release_date === "string" ? rec.release_date : "";
  if (!slug || !name) return null;
  return toClosedEntry(slug, name, creator, date);
}

export function toClosedReleasesFromIndex(models: unknown): ClosedReleaseEntry[] {
  if (!Array.isArray(models)) return [];
  const entries = (models as ArtificialAnalysisModel[])
    .map(toClosedReleaseFromIndex)
    .filter((e): e is ClosedReleaseEntry => e !== null);
  const deduped = dedupeBy(entries, (e) => e.id);
  deduped.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
  return deduped;
}

export function toClosedReleases(changelog: unknown): ClosedReleaseEntry[] {
  if (!Array.isArray(changelog)) return [];
  const records = changelog.filter(
    (e): e is import("@/server/parsers/aa").ChangelogModel =>
      e !== null && typeof e === "object" && typeof (e as { slug?: unknown }).slug === "string",
  );
  const sorted = [...records].sort(byDateDesc((e) => e.releaseDate));
  const entries = dedupeBy(sorted, (e) => e.releaseSlug)
    .map(toClosedRelease)
    .filter((e): e is ClosedReleaseEntry => e !== null);
  return entries;
}
