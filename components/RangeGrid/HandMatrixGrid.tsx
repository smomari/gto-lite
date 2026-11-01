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
  /** Below the grid on small screens, for what a hover tooltip shows elsewhere. */
  detail?: ReactNode;
  /** The action buttons above already carry these colors, so small screens can spend the height on the chart. */
  hideLegendOnSmallScreens?: boolean;
}

const GRID_STYLE = {
  gridTemplateColumns: "repeat(13, minmax(0, 1fr))",
  gridTemplateRows: "repeat(13, minmax(0, 1fr))",
};

/**
 * On a desktop, rows are 1fr of whatever height the parent hands down, so the
 * full 13x13 grid fits without scrolling. A phone has too little height for
 * that, so there the grid is square, as wide as it can be, and the page scrolls.
 */
export function HandMatrixGrid({ renderCell, legend, detail, hideLegendOnSmallScreens }: HandMatrixGridProps) {
  return (
    <div className="flex flex-col gap-2 lg:h-full lg:min-h-0">
      <div
        className="mx-auto grid aspect-square w-full max-w-[100dvh] gap-[2px] lg:mx-0 lg:aspect-auto lg:min-h-0 lg:max-w-none lg:flex-1"
        style={GRID_STYLE}
      >
        {HAND_MATRIX.flatMap((row) => row.map((hand) => <Fragment key={hand}>{renderCell(hand)}</Fragment>))}
      </div>
      {detail}
      <div className={`flex-wrap gap-4 text-sm text-zinc-700 dark:text-zinc-300 ${hideLegendOnSmallScreens ? "hidden lg:flex" : "flex"}`}>
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
