import type { ActionNode, ActionType, Position } from "@/types/rangeData";
import type { AvailableActions } from "@/types/solveApi";
import { SEAT_ORDER, seatIndex } from "@/lib/actionTree/seatOrder";
import { SeatBox } from "./SeatBox";

interface SeatActionBarProps {
  stackBb: number;
  actionPath: ActionNode[];
  activeSeat: Position | null;
  availableActions: AvailableActions | null;
  loading: boolean;
  onAction: (action: ActionType) => void;
  onRevisit: (globalIndex: number) => void;
  onQuickFold: (target: Position) => void;
}

export function SeatActionBar({
  stackBb,
  actionPath,
  activeSeat,
  availableActions,
  loading,
  onAction,
  onRevisit,
  onQuickFold,
}: SeatActionBarProps) {
  const activeIndex = activeSeat ? seatIndex(activeSeat) : -1;
  // No raise has occurred yet in the current active spot: folding every seat up
  // to and including BB would leave BB as the sole survivor mid-batch, which
  // the server correctly rejects (the hand already resolves as an uncontested
  // walk one entry earlier). Once a raise exists, BB folding is always a safe,
  // ordinary single action, so the shortcut is fine.
  const noAggressorYet = !availableActions?.call;

  return (
    <div className="flex flex-wrap gap-2">
      {SEAT_ORDER.map((position) => {
        const history = actionPath
          .map((entry, globalIndex) => ({ entry, globalIndex }))
          .filter(({ entry }) => entry.actor === position);
        const isFolded = history.length > 0 && history[history.length - 1].entry.action === "fold";
        const isActive = position === activeSeat;
        const isPending = !isActive && history.length === 0 && activeIndex !== -1 && seatIndex(position) > activeIndex;
        const showQuickFold = isPending && !(position === "BB" && noAggressorYet);
        return (
          <SeatBox
            key={position}
            position={position}
            stackBb={stackBb}
            history={history}
            isActive={isActive}
            isFolded={isFolded}
            availableActions={isActive ? availableActions : null}
            loading={isActive && loading}
            onAction={onAction}
            onRevisit={onRevisit}
            showQuickFold={showQuickFold}
            onQuickFold={() => onQuickFold(position)}
          />
        );
      })}
    </div>
  );
}
