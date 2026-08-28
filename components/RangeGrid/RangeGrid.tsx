import { HAND_MATRIX } from "@/lib/handRange/matrix";
import type { RangeScenario } from "@/types/rangeData";
import { HandCell } from "./HandCell";
import { ACTION_COLORS, ACTION_LABELS } from "./colorLegend";

interface RangeGridProps {
  scenario: RangeScenario;
}

export function RangeGrid({ scenario }: RangeGridProps) {
  const byHand = new Map(scenario.hands.map((h) => [h.hand, h]));

  return (
    <div className="flex flex-col gap-3">
      <div
        className="grid gap-[2px]"
        style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}
      >
        {HAND_MATRIX.flatMap((row, i) =>
          row.map((hand, j) => (
            <HandCell key={`${i}-${j}`} hand={hand} frequency={byHand.get(hand)} />
          )),
        )}
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-zinc-700 dark:text-zinc-300">
        {(Object.keys(ACTION_LABELS) as Array<keyof typeof ACTION_LABELS>).map((key) => (
          <div key={key} className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: ACTION_COLORS[key] }}
            />
            <span>{ACTION_LABELS[key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
