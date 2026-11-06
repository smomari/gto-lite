import type { HandoffSeat } from "@/lib/solveEngine/postflopHandoff";

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
  return (
    <>
      <p className="text-sm text-ink-muted">
        {reason === "uncontested"
          ? "Hand ends uncontested — everyone folded."
          : "Preflop action is closed — multiple players see a flop."}{" "}
        Pot {potBb.toFixed(1)}bb. Undo a seat above to continue exploring.
      </p>

      {reason === "action-closed" && (
        <div className="text-sm text-ink-muted">
          <p className="mb-1">Live to the flop:</p>
          <ul className="list-inside list-disc">
            {liveSeats.map(({ seat, remainingBb }) => (
              <li key={seat}>
                {seat} — {remainingBb.toFixed(1)}bb remaining
              </li>
            ))}
          </ul>
        </div>
      )}

      {reason === "action-closed" && (
        <p className="text-xs text-ink-faint">
          {liveSeats.length !== 2
            ? "Postflop solving needs exactly 2 live players (multiway pots aren't supported)."
            : rangeLoadFailed
              ? "Couldn't load a player's range."
              : "Loading both players' ranges…"}
        </p>
      )}

      {rangeLoadFailed && (
        <button
          type="button"
          onClick={onRetry}
          className="self-start rounded px-3 py-1.5 text-sm text-ink-muted hover:bg-raised hover:text-ink pointer-coarse:min-h-11"
        >
          Retry
        </button>
      )}

      <button
        type="button"
        onClick={onNewHand}
        className="w-full self-start rounded bg-accent px-3 py-1.5 text-sm font-medium text-canvas pointer-coarse:min-h-11 sm:w-auto"
      >
        New hand
      </button>
    </>
  );
}
