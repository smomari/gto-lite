import type { ActionNode, ActionType, Position } from "@/types/rangeData";
import type { AvailableActions } from "@/types/solveApi";
import { SEAT_ORDER } from "@/lib/actionTree/seatOrder";
import { SeatBox } from "./SeatBox";

interface SeatActionBarProps {
  stackBb: number;
  actionPath: ActionNode[];
  activeSeat: Position | null;
  availableActions: AvailableActions | null;
  loading: boolean;
  onAction: (action: ActionType) => void;
  onRevisit: (globalIndex: number) => void;
}

export function SeatActionBar({
  stackBb,
  actionPath,
  activeSeat,
  availableActions,
  loading,
  onAction,
  onRevisit,
}: SeatActionBarProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {SEAT_ORDER.map((position) => {
        const history = actionPath
          .map((entry, globalIndex) => ({ entry, globalIndex }))
          .filter(({ entry }) => entry.actor === position);
        const isFolded = history.length > 0 && history[history.length - 1].entry.action === "fold";
        const isActive = position === activeSeat;
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
          />
        );
      })}
    </div>
  );
}
