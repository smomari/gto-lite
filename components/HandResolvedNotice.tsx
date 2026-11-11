import type { HandoffSeat } from "@/lib/solveEngine/postflopHandoff";
import { useMessages } from "@/lib/i18n/locale";

interface HandResolvedNoticeProps {
  reason: string;
  potBb: number;
  liveSeats: HandoffSeat[];
  /** A live seat's range couldn't be fetched. */
  rangeLoadFailed: boolean;
  onRetry: () => void;
  onNewHand: () => void;
}

/** Preflop is over but there's no postflop solve to show: everyone folded, the pot is multiway, or the ranges are still on their way. */
export function HandResolvedNotice({ reason, potBb, liveSeats, rangeLoadFailed, onRetry, onNewHand }: HandResolvedNoticeProps) {
  const t = useMessages();
  return (
    <>
      <p className="text-sm text-ink-muted">
        {reason === "uncontested" ? t.resolved.uncontested : t.resolved.actionClosed} {t.resolved.potContinue(potBb.toFixed(1))}
      </p>

      {reason === "action-closed" && (
        <div className="text-sm text-ink-muted">
          <p className="mb-1">{t.resolved.liveToFlop}</p>
          <ul className="list-inside list-disc">
            {liveSeats.map(({ seat, remainingBb }) => (
              <li key={seat}>
                {t.resolved.seatRemaining(seat, remainingBb.toFixed(1))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {reason === "action-closed" && (
        <p className="text-xs text-ink-faint">
          {liveSeats.length !== 2
            ? t.resolved.multiway
            : rangeLoadFailed
              ? t.resolved.rangeLoadFailed
              : t.resolved.loadingRanges}
        </p>
      )}

      {rangeLoadFailed && (
        <button
          type="button"
          onClick={onRetry}
          className="self-start rounded px-3 py-1.5 text-sm text-ink-muted hover:bg-raised hover:text-ink pointer-coarse:min-h-11"
        >
          {t.common.retry}
        </button>
      )}

      <button
        type="button"
        onClick={onNewHand}
        className="w-full self-start rounded bg-accent px-3 py-1.5 text-sm font-medium text-canvas pointer-coarse:min-h-11 sm:w-auto"
      >
        {t.common.newHand}
      </button>
    </>
  );
}
