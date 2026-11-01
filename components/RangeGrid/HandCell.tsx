import type { HandFrequency } from "@/types/rangeData";
import { formatPercent } from "@/lib/format";
import { ACTION_COLORS } from "./colorLegend";

interface HandCellProps {
  hand: string;
  frequency?: HandFrequency;
  /** Shown as selected on small screens, where a tap stands in for the hover tooltip. */
  isSelected: boolean;
  onClick: () => void;
}

const FALLBACK: Omit<HandFrequency, "hand"> = { fold: 1, call: 0, raise: 0 };

export function HandCell({ hand, frequency, isSelected, onClick }: HandCellProps) {
  const freq = frequency ?? { hand, ...FALLBACK };
  const allin = freq.allin ?? 0;

  const segments = [
    { key: "allin", value: allin, color: ACTION_COLORS.allin },
    { key: "raise", value: freq.raise, color: ACTION_COLORS.raise },
    { key: "call", value: freq.call, color: ACTION_COLORS.call },
    { key: "fold", value: freq.fold, color: ACTION_COLORS.fold },
  ].filter((s) => s.value > 0);

  const tooltip = `${hand}\nFold ${formatPercent(freq.fold)} / Call ${formatPercent(freq.call)} / Raise ${formatPercent(freq.raise)}${
    allin ? ` / All-in ${formatPercent(allin)}` : ""
  }`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative block h-full w-full cursor-default overflow-hidden rounded-[2px] border border-black/10 dark:border-white/10 ${
        isSelected ? "max-lg:ring-2 max-lg:ring-emerald-500" : ""
      }`}
      title={tooltip}
      data-hand={hand}
      data-testid="hand-cell"
    >
      <div className="flex h-full w-full flex-col">
        {segments.map((s) => (
          <div key={s.key} style={{ flex: `${s.value} 0 0`, backgroundColor: s.color }} />
        ))}
      </div>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] font-medium text-white [text-shadow:0_1px_2px_rgb(0_0_0_/_0.7)] sm:text-[10px]">
        {hand}
      </span>
    </button>
  );
}
