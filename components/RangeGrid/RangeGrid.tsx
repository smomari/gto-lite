import { useState } from "react";
import { formatPercent } from "@/lib/format";
import type { HandFrequency, RangeScenario } from "@/types/rangeData";
import { HandCell } from "./HandCell";
import { HandMatrixGrid, type HandMatrixLegendItem } from "./HandMatrixGrid";
import { ACTION_COLORS, ACTION_KEYS } from "./colorLegend";
import { useMessages } from "@/lib/i18n/locale";
import type { Messages } from "@/lib/i18n/messages";

interface RangeGridProps {
  scenario: RangeScenario;
}

function frequencyLine(frequency: HandFrequency, t: Messages): string {
  return ACTION_KEYS
    .map((key) => ({ label: t.actionLegend[key], value: frequency[key] ?? 0 }))
    .filter((action) => action.value > 0)
    .map((action) => `${action.label} ${formatPercent(action.value)}`)
    .join(" · ");
}

export function RangeGrid({ scenario }: RangeGridProps) {
  const t = useMessages();
  const legend: HandMatrixLegendItem[] = ACTION_KEYS.map((key) => ({ key, label: t.actionLegend[key], color: ACTION_COLORS[key] }));
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
      legend={legend}
      detail={
        <p data-testid="hand-detail" className="min-h-5 font-mono text-sm tabular-nums text-ink-muted lg:hidden">
          {selected ? `${selected.hand}: ${frequencyLine(selected, t)}` : t.preflop.tapHand}
        </p>
      }
    />
  );
}
