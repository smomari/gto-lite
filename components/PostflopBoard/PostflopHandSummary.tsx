"use client";

import { useState, type ReactNode } from "react";
import { ShowdownRangeGrid } from "@/components/PostflopStrategy/ShowdownRangeGrid";
import type { CheckdownEquitySummary } from "@/lib/postflopSolver/checkdownEquity";
import type { SerializedCombo } from "@/types/postflopSolver";
import { CardChip } from "./CardChip";
import { useMessages } from "@/lib/i18n/locale";
import type { Messages } from "@/lib/i18n/messages";

const HERO_COLOR = "#4874ad";
const VILLAIN_COLOR = "#c4692f";
/** Below this a range rounds to 0.0 combos: the solver all but never plays the line. */
const RARE_LINE_COMBOS = 0.05;

export type HandOutcome = { kind: "showdown" } | { kind: "allin"; note: string } | { kind: "fold"; winnerLabel: string };

export interface HandSummaryStreet {
  label: string;
  potBb: number;
  actions: string[];
}

interface PlayerRanges {
  label: string;
  start: SerializedCombo[];
  end: SerializedCombo[];
}

interface PostflopHandSummaryProps {
  outcome: HandOutcome;
  board: string[];
  potBb: number;
  /** Taken from the pot; the rest is what the winner collects. */
  rakeBb: number;
  /** Average over the ranges reaching this point; absent when a fold ended the hand. */
  equity?: CheckdownEquitySummary;
  streets: HandSummaryStreet[];
  hero: PlayerRanges;
  villain: PlayerRanges;
  /** Where to go next; right under the result, so it is on screen before the range charts. */
  actions?: ReactNode;
  /** Under the actions, for the same reason. */
  explanation?: ReactNode;
}

function headline(outcome: HandOutcome, t: Messages): string {
  if (outcome.kind === "fold") return t.summary.wins(outcome.winnerLabel);
  return outcome.kind === "allin" ? t.summary.allInRunout : t.summary.showdown;
}

const comboCount = (range: SerializedCombo[]) => range.reduce((sum, c) => sum + c.weight, 0);
const formatCombos = (count: number) => (count < RARE_LINE_COMBOS ? "<0.1" : count.toFixed(1));

function EquitySide({ label, equity, potShare, align }: { label: string; equity: number; potShare: number; align: "left" | "right" }) {
  const t = useMessages();
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className="text-sm font-semibold text-ink">{label}</div>
      <div className="font-mono text-xl font-medium tabular-nums text-ink">{equity.toFixed(1)}%</div>
      <div className="text-xs text-ink-muted">
        {t.summary.potShare} <span className="font-mono tabular-nums text-ink">{potShare.toFixed(1)}bb</span>
      </div>
    </div>
  );
}

/** What a finished hand came to: how the two ranges stacked up, who got there, and how the hand went. */
export function PostflopHandSummary({ outcome, board, potBb, rakeBb, equity, streets, hero, villain, actions, explanation }: PostflopHandSummaryProps) {
  const t = useMessages();
  const [shownPlayer, setShownPlayer] = useState<"hero" | "villain">("hero");
  const rarePlayer = [hero, villain].find((ranges) => comboCount(ranges.end) < RARE_LINE_COMBOS);
  const collectedBb = potBb - rakeBb;
  const rangeTitle = outcome.kind === "fold" ? t.summary.atEnd : outcome.kind === "allin" ? t.summary.allIn : t.summary.atShowdown;

  return (
    <div data-testid="hand-summary" className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-accent">{headline(outcome, t)}</p>
          <div className="mt-1.5 flex flex-wrap gap-1" data-testid="summary-board">
            {board.map((card, i) => (
              <span key={card} className={i >= 3 ? "ml-1" : ""}>
                <CardChip card={card} size="sm" />
              </span>
            ))}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-ink-muted">{t.summary.finalPot}</p>
          <p className="font-mono text-xl font-medium tabular-nums text-ink">{potBb.toFixed(1)}bb</p>
          {rakeBb > 0 && (
            <p className="text-xs text-ink-faint">
              {t.summary.rake} <span className="font-mono tabular-nums">{rakeBb.toFixed(1)}bb</span>
            </p>
          )}
        </div>
      </div>

      {outcome.kind === "allin" && <p className="text-xs text-ink-muted">{outcome.note}</p>}

      {actions}
      {explanation}

      {equity && (
        <div className="border-y border-line py-3">
          <div className="mb-2 flex justify-between">
            <EquitySide label={hero.label} equity={equity.heroEquityPercent} potShare={(equity.heroEquityPercent / 100) * collectedBb} align="left" />
            <EquitySide label={villain.label} equity={equity.villainEquityPercent} potShare={(equity.villainEquityPercent / 100) * collectedBb} align="right" />
          </div>
          <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-[2px]">
            <div style={{ flex: `${equity.heroEquityPercent} 0 0`, backgroundColor: HERO_COLOR }} />
            <div style={{ flex: `${equity.villainEquityPercent} 0 0`, backgroundColor: VILLAIN_COLOR }} />
          </div>
          <p className="mt-2 text-xs text-ink-faint">
            {rarePlayer
              ? t.summary.rareLine(rarePlayer.label)
              : t.summary.averageEquity}
          </p>
        </div>
      )}

      <div className="flex gap-1 lg:hidden" role="tablist">
        {(["hero", "villain"] as const).map((player) => (
          <button
            key={player}
            type="button"
            role="tab"
            aria-selected={shownPlayer === player}
            onClick={() => setShownPlayer(player)}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium pointer-coarse:min-h-9 ${
              shownPlayer === player ? "bg-raised text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]" : "text-ink-muted"
            }`}
          >
            {t.summary.range((player === "hero" ? hero : villain).label)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_260px]">
        {([["hero", hero, HERO_COLOR], ["villain", villain, VILLAIN_COLOR]] as const).map(([player, ranges, color]) => (
          <div key={player} data-testid={`summary-range-${player}`} className={shownPlayer === player ? "" : "hidden lg:block"}>
            <div className="mb-1.5 flex items-baseline justify-between text-xs text-ink-muted">
              <span>
                <span className="font-semibold text-ink">{ranges.label}</span> {rangeTitle}
              </span>
              <span className="font-mono tabular-nums">{t.common.combos(formatCombos(comboCount(ranges.end)))}</span>
            </div>
            <ShowdownRangeGrid startRange={ranges.start} endRange={ranges.end} color={color} />
          </div>
        ))}

        <div>
          <p className="mb-1.5 text-xs font-semibold text-ink">{t.summary.howItWent}</p>
          {streets.map((street) => (
            <div key={street.label} className="grid grid-cols-[44px_1fr_auto] items-baseline gap-2 border-t border-line py-2 text-xs">
              <span className="font-semibold text-ink">{street.label}</span>
              <span className="text-ink-muted">{street.actions.join(" · ") || "—"}</span>
              <span className="font-mono tabular-nums text-ink-faint">{t.summary.pot(street.potBb.toFixed(1))}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
