import { HAND_BY_LABEL, TOTAL_COMBOS } from "@/lib/handRange/handList";
import type { HandFrequency } from "@/types/rangeData";
import { formatPercent } from "@/lib/format";
import { ACTION_COLORS, ACTION_KEYS } from "@/components/RangeGrid/colorLegend";
import { useMessages } from "@/lib/i18n/locale";

function comboWeighted(hands: HandFrequency[], key: keyof typeof ACTION_COLORS): number {
  return hands.reduce((sum, h) => sum + (h[key] ?? 0) * (HAND_BY_LABEL.get(h.hand)?.combos ?? 0), 0);
}

export function ActionSummaryTiles({ hands }: { hands: HandFrequency[] }) {
  const t = useMessages();
  const combos = {
    fold: comboWeighted(hands, "fold"),
    call: comboWeighted(hands, "call"),
    raise: comboWeighted(hands, "raise"),
    allin: comboWeighted(hands, "allin"),
  };

  const tiles = ACTION_KEYS.filter((key) => combos[key] > 0.001);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1">
        {tiles.map((key) => (
          <div key={key} className="min-w-0 flex-1 px-2 py-1">
            <div className="flex items-center gap-1.5 text-xs text-ink-muted">
              <span className="h-2 w-2 shrink-0 rounded-[2px] ring-1 ring-line-strong" style={{ backgroundColor: ACTION_COLORS[key] }} />
              {t.actionLegend[key]}
            </div>
            <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-2">
              <span className="font-mono text-xl font-medium tabular-nums text-ink">{formatPercent(combos[key] / TOTAL_COMBOS)}</span>
              <span className="font-mono text-xs tabular-nums text-ink-faint">{t.common.combos(combos[key].toFixed(1))}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex h-1 overflow-hidden rounded-[1px] bg-raised">
        {tiles
          .filter((key) => key !== "fold")
          .map((key) => (
            <div key={key} style={{ flex: `${combos[key]} 0 0`, backgroundColor: ACTION_COLORS[key] }} />
          ))}
        <div style={{ flex: `${combos.fold} 0 0` }} />
      </div>
    </div>
  );
}
