import { useState } from "react";
import { useTranslation } from "@/client/providers";
import { SuspenseQuery } from "@/client/components/feedback";
import { RadioToolbar } from "@/client/components/ui/tabs";
import { useSuspenseArenaBoard } from "@/client/api/queries";
import { ARENA_BOARD_CATEGORIES, ARENA_BOARD_IDS, type ArenaBoardKey } from "@/shared/config";
import { ArenaTable } from "@/client/features/rankings/rank-shared";

function BenchmarkBoardContent({ category }: { category: ArenaBoardKey }) {
  const { data } = useSuspenseArenaBoard(category);
  return <ArenaTable entries={data.entries} />;
}

export function BenchmarkBoardView() {
  const { t } = useTranslation();
  const [category, setCategory] = useState<ArenaBoardKey>(ARENA_BOARD_IDS[0] ?? "coding");
  return (
    <div className="flex flex-col gap-4">
      <RadioToolbar
        label={t("benchmarkRankings")}
        items={ARENA_BOARD_IDS.map((id) => ({ id, label: t(ARENA_BOARD_CATEGORIES[id].labelKey) }))}
        value={category}
        onChange={(id) => setCategory(id as ArenaBoardKey)}
      />
      {}
      <SuspenseQuery resetKey={category}>
        <BenchmarkBoardContent category={category} />
      </SuspenseQuery>
    </div>
  );
}
