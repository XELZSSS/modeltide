import { useMemo } from "react";
import { qOfficialPricing } from "@/client/api/queries";
import { makeOfficialGetter, type OfficialGetter } from "@/client/utils/pricing-merge";

export interface OfficialPricing {
  getOfficial: OfficialGetter | undefined;
  isPending: boolean;
  isError: boolean;
}

export function useOfficialPricing(enabled = true): OfficialPricing {
  const officialQ = qOfficialPricing.use(enabled);
  const getOfficial = useMemo<OfficialGetter | undefined>(
    () => (officialQ.data ? makeOfficialGetter(officialQ.data.models) : undefined),
    [officialQ.data],
  );
  return { getOfficial, isPending: officialQ.isPending, isError: officialQ.isError };
}
