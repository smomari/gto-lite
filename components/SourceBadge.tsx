import type { RangeSource } from "@/types/rangeData";

const SOURCE_LABEL: Record<RangeSource, string> = {
  "nash-shove-fold": "Nash-Solved (Exact, chip-EV)",
  "heuristic-approx": "Heuristic Approximation",
  "solver-export": "Solver Export",
};

const SOURCE_STYLE: Record<RangeSource, string> = {
  "nash-shove-fold":
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  "heuristic-approx": "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  "solver-export": "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
};

export function SourceBadge({ source }: { source: RangeSource }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${SOURCE_STYLE[source]}`}
    >
      {SOURCE_LABEL[source]}
    </span>
  );
}
