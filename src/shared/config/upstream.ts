export const upstreamConfig = {
  artificialAnalysis: "https://artificialanalysis.ai",
  huggingface: "https://huggingface.co/api/models",
  openrouter: "https://openrouter.ai",
} as const satisfies Record<"artificialAnalysis" | "huggingface" | "openrouter", string>;

export const USER_AGENT = "AITIWETA/1.0";
export const WARM_ORIGIN = "https://aitiweta.internal";
