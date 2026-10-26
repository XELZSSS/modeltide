import type { TFunction } from "@/shared/i18n";
import type { ArtificialAnalysisModel, ModelPricing, OpenSourceModelEntry } from "@/shared/types";

export const t = ((key: string) => key) as unknown as TFunction;

export function aaModel(fields: Partial<ArtificialAnalysisModel> = {}): ArtificialAnalysisModel {
  return {
    id: "model-a",
    slug: "model-a",
    name: "Model A",
    short_name: null,
    model_creators: null,
    intelligence_index: null,
    is_reasoning: false,
    release_date: null,
    is_open_weights: false,
    parameters: null,
    size_class: null,
    context_window_tokens: null,
    coding_index: null,
    agentic_index: null,
    benchmarks: {},
    pricing: null,
    speed: null,
    modalities: { in: ["text"], out: ["text"] },
    omniscience_breakdown: null,
    ...fields,
  };
}

export function modelPricing(fields: Partial<ModelPricing> = {}): ModelPricing {
  return { input: 1, output: 4, cacheHit: 0.25, cacheWrite: 1.25, ...fields };
}

export function openSourceRow(fields: Partial<OpenSourceModelEntry> = {}): OpenSourceModelEntry {
  return {
    id: "org/model",
    author: "org",
    downloads: 0,
    likes: 0,
    license: null,
    task: null,
    createdAt: null,
    lastModified: null,
    tags: [],
    ...fields,
  };
}

/**
 * The two leg factories `fan-out.test.ts` and `join-legs.test.ts` each carried a copy of. They are the whole input
 * shape of `runLegs`, so the pair belongs with the other fixtures rather than once per caller.
 */
export const okLeg = <T>(label: string, value: T) => ({ label, run: async () => value });

export const failingLeg = (label: string, reason: unknown) => ({
  label,
  run: async () => {
    throw reason;
  },
});
