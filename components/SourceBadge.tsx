import type { RangeSource } from "@/types/rangeData";
import type { IcmId } from "@/lib/solveEngine/icm";
import { useMessages } from "@/lib/i18n/locale";

/** With `icm`, the ranges were priced in prize money at that stage. */
export function SourceBadge({ source, icm }: { source: RangeSource; icm?: IcmId }) {
  const t = useMessages();
  const sourceLabel: Record<RangeSource, string> = { "nash-shove-fold": t.preflop.nash, "heuristic-approx": t.preflop.estimated };
  return (
    <span className={`text-xs font-medium ${source === "heuristic-approx" ? "text-ink-muted" : "text-accent"}`}>
      {sourceLabel[source]}
      {icm && ` · ${t.settings.icmStage(t.icm[icm].label)}`}
    </span>
  );
}
