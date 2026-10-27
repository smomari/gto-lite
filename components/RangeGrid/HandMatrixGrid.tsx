import { Fragment, type ReactNode } from "react";
import { HAND_MATRIX } from "@/lib/handRange/matrix";

export interface HandMatrixLegendItem {
  key: string;
  label: string;
  color: string;
}

interface HandMatrixGridProps {
  renderCell: (hand: string) => ReactNode;
  legend: HandMatrixLegendItem[];
}

const GRID_STYLE = {
  gridTemplateColumns: "repeat(13, minmax(0, 1fr))",
  gridTemplateRows: "repeat(13, minmax(0, 1fr))",
};

/** Rows are 1fr of whatever height the parent hands down, so the full 13x13 grid always fits without scrolling. */
export function HandMatrixGrid({ renderCell, legend }: HandMatrixGridProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="grid flex-1 min-h-0 gap-[2px]" style={GRID_STYLE}>
        {HAND_MATRIX.flatMap((row) => row.map((hand) => <Fragment key={hand}>{renderCell(hand)}</Fragment>))}
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-zinc-700 dark:text-zinc-300">
        {legend.map((item) => (
          <div key={item.key} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: item.color }} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
