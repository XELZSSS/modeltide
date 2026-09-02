import type { OfficialPriceModel } from "@/shared/types";
import { isUsablePricing } from "@/server/sources/data-filter";

const MAX_PLAUSIBLE_RATE = 1000;

export function officialModel(
  provider: string,
  id: string,
  name: string,
  input: number | null,
  output: number | null,
  cachedInput: number | null = null,
  contextWindow: number | null = null,
): OfficialPriceModel | null {
  if (!isUsablePricing(input, output)) return null;
  if (input != null && input > MAX_PLAUSIBLE_RATE) return null;
  if (output != null && output > MAX_PLAUSIBLE_RATE) return null;
  if (cachedInput != null && cachedInput > MAX_PLAUSIBLE_RATE) return null;
  return { id, name, provider, input, cachedInput, output, contextWindow };
}
