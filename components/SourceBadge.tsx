import type { RangeSource } from "@/types/rangeData";
import { icmById, type IcmId } from "@/lib/solveEngine/icm";

const SOURCE_LABEL: Record<RangeSource, string> = {
  "nash-shove-fold": "Nash",
  "heuristic-approx": "Estimated",
};

/** With `icm`, the ranges were priced in prize money at that stage. */
export function SourceBadge({ source, icm }: { source: RangeSource; icm?: IcmId }) {
  return (
    <span className={`text-xs font-medium ${source === "heuristic-approx" ? "text-ink-muted" : "text-accent"}`}>
      {SOURCE_LABEL[source]}
      {icm && ` · ICM ${icmById(icm)?.label ?? icm}`}
    </span>
  );
}
