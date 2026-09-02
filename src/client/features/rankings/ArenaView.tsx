import { useSuspenseArenaRankings } from "@/client/api/queries";
import { ArenaTable } from "@/client/features/rankings/rank-shared";

export function ArenaRankingsView() {
  const { data } = useSuspenseArenaRankings();
  return <ArenaTable entries={data.entries} />;
}
