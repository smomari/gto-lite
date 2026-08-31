import type { PostflopActionType } from "@/lib/postflopSolver/potState";
import { POSTFLOP_ACTION_COLORS, POSTFLOP_ACTION_ORDER } from "./postflopColorLegend";

interface PostflopHandCellProps {
  hand: string;
  /** Average strategy for this hand at this node, keyed by action. Undefined entries omitted from the bar. */
  actionFrequencies: Partial<Record<PostflopActionType, number>>;
  /** False when this hand carries no weight in the acting player's range here (folded earlier, or fully board-blocked). */
  inRange: boolean;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

export function PostflopHandCell({ hand, actionFrequencies, inRange }: PostflopHandCellProps) {
  const segments = POSTFLOP_ACTION_ORDER.map((action) => ({
    key: action,
    value: actionFrequencies[action] ?? 0,
    color: POSTFLOP_ACTION_COLORS[action],
  })).filter((s) => s.value > 0);

  const tooltip = inRange
    ? [hand, ...POSTFLOP_ACTION_ORDER.filter((a) => (actionFrequencies[a] ?? 0) > 0).map((a) => `${a} ${pct(actionFrequencies[a]!)}`)].join(
        "\n",
      )
    : `${hand}\nNot in range`;

  return (
    <div
      className="relative aspect-square w-full overflow-hidden rounded-[2px] border border-black/10 dark:border-white/10"
      title={tooltip}
      data-hand={hand}
      data-testid="postflop-hand-cell"
    >
      <div className="flex h-full w-full flex-col bg-zinc-200 dark:bg-zinc-800">
        {inRange &&
          segments.map((s) => <div key={s.key} style={{ flex: `${s.value} 0 0`, backgroundColor: s.color }} />)}
      </div>
      <span
        className={`pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] font-medium sm:text-[10px] ${
          inRange ? "text-white [text-shadow:0_1px_2px_rgb(0_0_0_/_0.7)]" : "text-zinc-400 dark:text-zinc-600"
        }`}
      >
        {hand}
      </span>
    </div>
  );
}
