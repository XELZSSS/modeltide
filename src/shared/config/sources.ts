import type { NewsCategory } from "@/shared/types/news";

export const NEWS_CATEGORIES = [
  "industry",
  "opensource",
  "hardware",
  "funding",
  "research",
] as const satisfies readonly NewsCategory[];
