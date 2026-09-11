import type { CheckdownEquitySummary } from "@/types/postflopSolver";

interface CheckdownEquityNoteProps {
  equity: CheckdownEquitySummary;
  heroLabel: string;
  villainLabel: string;
}

function formatBb(bb: number): string {
  return `${bb > 0 ? "+" : ""}${bb.toFixed(2)}bb`;
}

/**
 * Surfaces the checked-down (no further betting) average equity/EV a
 * terminal-showdown node already carries internally — see
 * checkdownEquity.ts. The caveat sentence is load-bearing: this number must
 * never be mistaken for the equilibrium value of actually continuing to
 * play the line (which would require real betting on the next street).
 */
export function CheckdownEquityNote({ equity, heroLabel, villainLabel }: CheckdownEquityNoteProps) {
  return (
    <p className="text-xs text-zinc-500 dark:text-zinc-400">
      Checkdown avg EV (all remaining runouts, assumes no further betting): {heroLabel}{" "}
      {equity.heroEquityPercent.toFixed(1)}% / {formatBb(equity.heroEvBb)} · {villainLabel}{" "}
      {equity.villainEquityPercent.toFixed(1)}% / {formatBb(equity.villainEvBb)}
    </p>
  );
}
