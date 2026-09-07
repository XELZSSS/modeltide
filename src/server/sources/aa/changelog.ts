import type { AppContext } from "@/server/context";
import { STATIC_TTL_MS } from "@/shared/config";
import { MAX_FEED_BYTES, UPSTREAM_FETCH_OPTS, cacheKeys, upstreamConfig } from "@/server/config";
import { UpstreamError } from "@/server/infra/errors";
import { MAX_SCAN_CHARS } from "@/server/parsers/rsc";
import { balancedJsonEnd } from "@/server/parsers/balanced";
import { isRecord, str } from "@/server/parsers/primitives";

const CHANGELOG_PATH = "/changelog";

export interface ChangelogModel {
  slug: string;
  name: string;
  releaseSlug: string;
  releaseName: string;
  releaseDate: string;
  creatorName: string;
}

const MODELS_NEEDLE_RE = /\\?"models\\?"\s*:/g;
const MODELS_KEY = '"models"';
const CANDIDATE_PREFIX_CHARS = 256;
const CANDIDATE_SUFFIX_CHARS = MAX_SCAN_CHARS + CANDIDATE_PREFIX_CHARS;

function unescapeWindow(window: string): string {
  return window.replace(/\\(.)/g, (m, c: string) => (c === '"' ? '"' : c === "\\" ? "\\" : m));
}

function parseModelsArrayAt(unescaped: string, d: number, found: unknown[]): void {
  const end = balancedJsonEnd(unescaped, d, MAX_SCAN_CHARS);
  if (end === -1) return;
  try {
    found.push(JSON.parse(unescaped.slice(d, end)));
  } catch {}
}

function extractModelsArrays(html: string): unknown[] {
  const found: unknown[] = [];
  MODELS_NEEDLE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MODELS_NEEDLE_RE.exec(html)) !== null) {
    const start = Math.max(0, match.index - CANDIDATE_PREFIX_CHARS);
    const window = unescapeWindow(html.slice(start, match.index + CANDIDATE_SUFFIX_CHARS));
    const at = window.indexOf(MODELS_KEY);
    if (at === -1) continue;
    let c = at + MODELS_KEY.length;
    while (c < window.length && /\s/.test(window[c]!)) c++;
    if (window[c] !== ":") continue;
    c++;
    while (c < window.length && /\s/.test(window[c]!)) c++;
    if (window[c] !== "[") continue;
    parseModelsArrayAt(window, c, found);
    MODELS_NEEDLE_RE.lastIndex = match.index + match[0].length;
  }
  return found;
}

function isChangelogRaw(e: unknown): e is Record<string, unknown> {
  if (!isRecord(e)) return false;
  const r = e as Record<string, unknown>;
  if (typeof r.slug !== "string" || typeof r.name !== "string" || typeof r.releaseDate !== "string") return false;
  if (!isRecord(r.release) || !isRecord(r.creator)) return false;
  return true;
}

function toChangelogModel(e: Record<string, unknown>): ChangelogModel | null {
  const release = e.release as Record<string, unknown>;
  const creator = e.creator as Record<string, unknown>;
  const slug = str(e.slug).trim();
  const name = str(e.name).trim();
  const releaseSlug = str(release.slug).trim();
  const releaseName = str(release.name).trim();
  const releaseDate = str(e.releaseDate).trim();
  const creatorName = str(creator.name).trim();
  if (!slug || !name || !releaseSlug || !releaseName || !releaseDate || !creatorName) return null;
  return { slug, name, releaseSlug, releaseName, releaseDate, creatorName };
}

export function parseChangelogModels(html: string): ChangelogModel[] {
  let best: ChangelogModel[] = [];
  for (const v of extractModelsArrays(html)) {
    if (!Array.isArray(v)) continue;
    const mapped = (v as unknown[])
      .filter(isChangelogRaw)
      .map(toChangelogModel)
      .filter((m): m is ChangelogModel => m !== null);
    if (mapped.length > best.length) best = mapped;
  }
  return best;
}

export async function fetchChangelogModels(ctx: AppContext): Promise<ChangelogModel[]> {
  const html = await ctx.http.text(
    `${upstreamConfig.artificialAnalysis}${CHANGELOG_PATH}`,
    {
      headers: { accept: "text/html,application/xhtml+xml,*/*" },
      ...UPSTREAM_FETCH_OPTS,
    },
    MAX_FEED_BYTES,
  );
  const models = parseChangelogModels(html);
  if (models.length === 0) {
    throw new UpstreamError(
      `AA changelog yielded 0 models (raw=1 page, kept=0, markup changed?, body=${html.length}B)`,
    );
  }
  return models;
}

export async function getChangelogModels(ctx: AppContext): Promise<ChangelogModel[]> {
  return ctx.cache.withTtl(cacheKeys.changelog, STATIC_TTL_MS, async () => {
    return { data: await fetchChangelogModels(ctx) };
  });
}
