import { CardChip } from "@/components/PostflopBoard/CardChip";

export interface StreetBoardSummary {
  streetLabel: "Flop" | "Turn" | "River";
  board: string[];
}

interface PostflopBoardStripProps {
  streets: StreetBoardSummary[];
}

/**
 * Compact confirmed-board display appended to the seat row (via
 * SeatActionBar's `trailing` prop) so the board stays visible in the same
 * horizontal strip as the seat action boxes, mirroring how reference GTO
 * sites show the board next to the seats instead of burying it further down
 * the page. Each `StreetStage.board` is already cumulative (flop's 3 cards,
 * then turn's board = those 3 + the turn card, etc.) — so only the most
 * advanced confirmed street is shown; rendering every street's entry would
 * repeat the earlier cards.
 */
export function PostflopBoardStrip({ streets }: PostflopBoardStripProps) {
  const confirmed = streets.filter((s) => s.board.length > 0);
  const latest = confirmed[confirmed.length - 1];
  if (!latest) return null;

  return (
    <div
      data-testid="postflop-board-strip"
      className="flex shrink-0 flex-col gap-1 border-l border-zinc-300 pl-2 dark:border-zinc-700"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {latest.streetLabel}
      </span>
      <div className="flex gap-0.5">
        {latest.board.map((card) => (
          <CardChip key={card} card={card} size="sm" />
        ))}
      </div>
    </div>
  );
}
