import { CardChip } from "@/components/PostflopBoard/CardChip";
import { comboKey } from "@/lib/cards";
import { buildComboIndex, enumerateCombos, filterBlockedCombos } from "@/lib/postflopSolver/combos";
import { formatPercent } from "@/lib/format";
import type { SerializedCombo, SerializedDecisionNode } from "@/types/postflopSolver";
import { useMessages } from "@/lib/i18n/locale";

interface SuitedComboBreakdownProps {
  selectedHand: string | null;
  node: SerializedDecisionNode | null;
  /** The acting player's range at this node — same array passed to PostflopRangeGrid. */
  range: SerializedCombo[];
  board: string[];
  /** Colors per action instance, index-aligned to `node.actions` (see `buildActionColorScale`). */
  colors: string[];
  heroLabel: string;
  villainLabel: string;
}

/**
 * The same canonical hand (e.g. "AKs") is 4 (or 6, for pairs) different
 * physical combos depending on suit, and board card removal means each live
 * one can have a different strategy. This breaks a selected canonical hand
 * down into its individual live (not board-blocked) suited combos, each with
 * its own action-frequency breakdown — frequency only, no EV (see the plan
 * doc: per-combo EV at an arbitrary decision node isn't computed anywhere
 * in the solver yet).
 */
export function SuitedComboBreakdown({ selectedHand, node, range, board, colors, heroLabel, villainLabel }: SuitedComboBreakdownProps) {
  const t = useMessages();
  if (!selectedHand || !node) {
    return (
      <p className="text-sm text-ink-muted">{t.solve.selectHand}</p>
    );
  }

  const liveCombos = filterBlockedCombos(
    enumerateCombos(selectedHand).map(([c1, c2]) => ({ cards: [c1, c2] as [string, string], weight: 1 })),
    board,
  );

  if (liveCombos.length === 0) {
    return (
      <p className="text-sm text-ink-muted">{t.solve.allBlocked(selectedHand)}</p>
    );
  }

  const comboIndex = buildComboIndex(range);
  const actorLabel = node.actor === "P1" ? heroLabel : villainLabel;

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-baseline justify-between text-base font-semibold text-ink">
        {selectedHand} <span className="text-xs font-normal text-ink-muted">{t.solve.bySuit}</span>
      </p>
      {liveCombos.map((combo) => {
        const key = comboKey(combo.cards);
        const idx = comboIndex.get(key);
        const inRange = idx !== undefined && range[idx].weight > 0;
        return (
          <div key={key} data-testid="suited-combo-row" className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div className="flex gap-0.5">
                <CardChip card={combo.cards[0]} size="sm" />
                <CardChip card={combo.cards[1]} size="sm" />
              </div>
              {!inRange && (
                <span className="text-xs text-ink-faint">{t.solve.notInActorRange(actorLabel)}</span>
              )}
            </div>
            {inRange && idx !== undefined && (
              <>
                <div className="flex h-1 w-full overflow-hidden rounded-[1px] bg-raised">
                  {node.actions.map((a, i) => {
                    const value = node.strategy[idx][i];
                    if (value <= 0) return null;
                    return <div key={a.label} style={{ flex: `${value} 0 0`, backgroundColor: colors[i] }} />;
                  })}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-xs tabular-nums text-ink-muted">
                  {node.actions.map((a, i) => {
                    const value = node.strategy[idx][i];
                    if (value <= 0) return null;
                    return (
                      <span key={a.label}>
                        {t.action(a.label)} {formatPercent(value)}
                      </span>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
