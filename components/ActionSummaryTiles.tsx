import { ALL_HANDS } from "@/lib/handRange/handList";
import type { HandFrequency } from "@/types/rangeData";
import { ACTION_COLORS, ACTION_LABELS } from "@/components/RangeGrid/colorLegend";

const TOTAL_COMBOS = ALL_HANDS.reduce((sum, h) => sum + h.combos, 0);

function comboWeighted(hands: HandFrequency[], key: keyof typeof ACTION_COLORS): number {
  const byHand = new Map(ALL_HANDS.map((h) => [h.hand, h.combos]));
  return hands.reduce((sum, h) => sum + (h[key] ?? 0) * (byHand.get(h.hand) ?? 0), 0);
}

export function ActionSummaryTiles({ hands }: { hands: HandFrequency[] }) {
  const combos = {
    fold: comboWeighted(hands, "fold"),
    call: comboWeighted(hands, "call"),
    raise: comboWeighted(hands, "raise"),
    allin: comboWeighted(hands, "allin"),
  };

  const tiles = (Object.keys(ACTION_LABELS) as Array<keyof typeof ACTION_LABELS>).filter(
    (key) => combos[key] > 0.001,
  );

  return (
    <div className="flex flex-wrap gap-2">
      {tiles.map((key) => (
        <div
          key={key}
          className="min-w-[120px] flex-1 rounded-lg p-3"
          style={{ backgroundColor: `${ACTION_COLORS[key]}22` }}
        >
          <div className="text-sm font-medium" style={{ color: ACTION_COLORS[key] }}>
            {ACTION_LABELS[key]}
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              {((combos[key] / TOTAL_COMBOS) * 100).toFixed(1)}%
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{combos[key].toFixed(1)} combos</span>
          </div>
        </div>
      ))}
    </div>
  );
}
