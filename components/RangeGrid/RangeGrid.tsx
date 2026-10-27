import type { RangeScenario } from "@/types/rangeData";
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

export function RangeGrid({ scenario }: RangeGridProps) {
  const byHand = new Map(scenario.hands.map((h) => [h.hand, h]));

  return <HandMatrixGrid renderCell={(hand) => <HandCell hand={hand} frequency={byHand.get(hand)} />} legend={LEGEND} />;
}
