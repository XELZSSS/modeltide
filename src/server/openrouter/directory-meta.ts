import { numCoerce, obj } from "@/server/formats/scalars";
import { isoDateOnly } from "@/server/formats/dates";
import { normalizeModelKey, toStringOrNull } from "@/shared/utils";
import type { ModelMetaEntry, PricingRow } from "@/server/formats/wire-types";

function mergeMetaRecord(target: ModelMetaEntry, patch: ModelMetaEntry): ModelMetaEntry {
  return {
    intelligenceIndex: target.intelligenceIndex ?? patch.intelligenceIndex,
    agenticIndex: target.agenticIndex ?? patch.agenticIndex,
    codingIndex: target.codingIndex ?? patch.codingIndex,
    expiresAt: target.expiresAt ?? patch.expiresAt,
  };
}

function isoExpiry(raw: unknown): string | null {
  const value = toStringOrNull(raw);
  if (!value) return null;
  return isoDateOnly(value.slice(0, 10));
}

/** Reads the AA benchmark block and expiry date off one directory row and files it under every model key. */
export function recordMeta(meta: Record<string, ModelMetaEntry>, raw: PricingRow): void {
  const benchmarks = obj(raw.benchmarks);
  const aaBenchmarks = obj(benchmarks?.artificial_analysis);
  const intelligenceIndex = numCoerce(aaBenchmarks?.intelligence_index);
  const codingIndex = numCoerce(aaBenchmarks?.coding_index);
  const agenticIndex = numCoerce(aaBenchmarks?.agentic_index);
  const expiresAt = isoExpiry(raw.expiration_date);
  if (intelligenceIndex == null && codingIndex == null && agenticIndex == null && expiresAt == null) return;

  const metaEntry: ModelMetaEntry = {};
  if (intelligenceIndex != null) metaEntry.intelligenceIndex = intelligenceIndex;
  if (agenticIndex != null) metaEntry.agenticIndex = agenticIndex;
  if (codingIndex != null) metaEntry.codingIndex = codingIndex;
  if (expiresAt != null) metaEntry.expiresAt = expiresAt;

  const keys = new Set<string>();
  for (const value of [raw.name, raw.id, raw.canonical_slug]) {
    if (typeof value === "string") {
      const key = normalizeModelKey(value);
      if (key) keys.add(key);
    }
  }
  for (const key of keys) {
    const cur = meta[key];
    meta[key] = cur ? mergeMetaRecord(cur, metaEntry) : metaEntry;
  }
}
