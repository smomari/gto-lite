import type { RangeSource } from "@/types/rangeData";

const SOURCE_LABEL: Record<RangeSource, string> = {
  "nash-shove-fold": "Nash",
  "heuristic-approx": "Estimated",
  "solver-export": "Solved",
};

export function SourceBadge({ source }: { source: RangeSource }) {
  return (
    <span className={`text-xs font-medium ${source === "heuristic-approx" ? "text-ink-muted" : "text-accent"}`}>
      {SOURCE_LABEL[source]}
    </span>
  );
}
