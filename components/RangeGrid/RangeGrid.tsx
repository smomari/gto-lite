import { useState } from "react";
import { formatPercent } from "@/lib/format";
import type { HandFrequency, RangeScenario } from "@/types/rangeData";
import { HandCell } from "./HandCell";
import { HandMatrixGrid, type HandMatrixLegendItem } from "./HandMatrixGrid";
import { ACTION_COLORS, ACTION_LABELS } from "./colorLegend";

interface RangeGridProps {
  scenario: RangeScenario;
}

const LEGEND: HandMatrixLegendItem[] = (Object.keys(ACTION_LABELS) as Array<keyof typeof ACTION_LABELS>).map((key) => ({
  key,
  label: ACTION_LABELS[key],
  color: ACTION_COLORS[key],
}));

function frequencyLine(frequency: HandFrequency): string {
  return (Object.keys(ACTION_LABELS) as Array<keyof typeof ACTION_LABELS>)
    .map((key) => ({ label: ACTION_LABELS[key], value: frequency[key] ?? 0 }))
    .filter((action) => action.value > 0)
    .map((action) => `${action.label} ${formatPercent(action.value)}`)
    .join(" · ");
}

export function RangeGrid({ scenario }: RangeGridProps) {
  const [selectedHand, setSelectedHand] = useState<string | null>(null);
  const byHand = new Map(scenario.hands.map((h) => [h.hand, h]));
  const selected = selectedHand ? byHand.get(selectedHand) : undefined;

  return (
    <HandMatrixGrid
      renderCell={(hand) => (
        <HandCell
          hand={hand}
          frequency={byHand.get(hand)}
          isSelected={selectedHand === hand}
          onClick={() => setSelectedHand(selectedHand === hand ? null : hand)}
        />
      )}
      legend={LEGEND}
      detail={
        <p data-testid="hand-detail" className="min-h-5 text-sm text-zinc-700 dark:text-zinc-300 lg:hidden">
          {selected ? `${selected.hand}: ${frequencyLine(selected)}` : "Tap a hand for its frequencies."}
        </p>
      }
    />
  );
}
