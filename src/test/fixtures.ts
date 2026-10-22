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
    coding_index: null,
    agentic_index: null,
    benchmarks: {},
    pricing: null,
    speed: null,
    input_modality_text: true,
    input_modality_image: false,
    input_modality_speech: false,
    input_modality_video: false,
    output_modality_text: true,
    output_modality_image: false,
    output_modality_speech: false,
    output_modality_video: false,
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
