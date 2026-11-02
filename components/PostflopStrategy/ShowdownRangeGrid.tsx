import { HandMatrixGrid } from "@/components/RangeGrid/HandMatrixGrid";
import { canonicalHandOf } from "@/lib/postflopSolver/canonicalHand";
import type { SerializedCombo } from "@/types/postflopSolver";
import { readableTextColor } from "./postflopColorLegend";

interface ShowdownRangeGridProps {
  /** The player's range entering the flop. */
  startRange: SerializedCombo[];
  /** The same player's range at the end of the hand. */
  endRange: SerializedCombo[];
  color: string;
}

function weightByHand(range: SerializedCombo[]): Map<string, number> {
  const weights = new Map<string, number>();
  for (const combo of range) {
    if (combo.weight <= 0) continue;
    const hand = canonicalHandOf(combo.cards);
    weights.set(hand, (weights.get(hand) ?? 0) + combo.weight);
  }
  return weights;
}

/** Each hand filled by how much of what entered the flop is still here at the end of the hand. */
export function ShowdownRangeGrid({ startRange, endRange, color }: ShowdownRangeGridProps) {
  const start = weightByHand(startRange);
  const end = weightByHand(endRange);

  return (
    <HandMatrixGrid
      legend={[]}
      alwaysSquare
      renderCell={(hand) => {
        const share = Math.min(1, (end.get(hand) ?? 0) / (start.get(hand) ?? 1));
        const reached = share > 0.0005;
        return (
          <div
            data-hand={hand}
            data-testid="showdown-cell"
            className={`relative h-full w-full overflow-hidden rounded-[2px] ${reached ? "bg-raised" : "bg-sunken"}`}
            title={reached ? `${hand}: ${(share * 100).toFixed(1)}% reaches here` : undefined}
          >
            {reached && <div className="absolute inset-y-0 left-0" style={{ width: `${share * 100}%`, backgroundColor: color }} />}
            <span
              className={`pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] font-medium sm:text-[10px] ${reached ? "" : "text-ink-faint"}`}
              style={reached ? { color: share > 0.5 ? readableTextColor(color) : "#f9fafb" } : undefined}
            >
              {hand}
            </span>
          </div>
        );
      }}
    />
  );
}
