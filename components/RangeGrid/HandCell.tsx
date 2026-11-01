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

  // A hand that's all fold is out of the range: let it sink so the range reads at a glance.
  const inRange = freq.fold < 1;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative block h-full w-full cursor-default overflow-hidden rounded-[2px] ${inRange ? "bg-raised" : "bg-sunken"} ${
        isSelected ? "max-lg:ring-[1.5px] max-lg:ring-accent" : ""
      }`}
      title={tooltip}
      data-hand={hand}
      data-testid="hand-cell"
    >
      {inRange && (
        <div className="flex h-full w-full">
          {segments.map((s) => (
            <div key={s.key} style={{ flex: `${s.value} 0 0`, backgroundColor: s.color }} />
          ))}
        </div>
      )}
      <span
        className={`pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] font-medium sm:text-[10px] ${
          inRange ? "text-white" : "text-ink-faint"
        }`}
      >
        {hand}
      </span>
    </button>
  );
}
