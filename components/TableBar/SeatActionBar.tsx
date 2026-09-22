import type { ActionNode, ActionType, Position } from "@/types/rangeData";
import type { AvailableActions } from "@/types/solveApi";
import { computeRoundActingOrder, previewQuickAction } from "@/lib/solveEngine/preview";
import { SeatBox } from "./SeatBox";

interface SeatActionBarProps {
  stackBb: number;
  actionPath: ActionNode[];
  activeSeat: Position | null;
  availableActions: AvailableActions | null;
  loading: boolean;
  onAction: (action: ActionType) => void;
  onRevisit: (globalIndex: number) => void;
  onQuickAction: (target: Position, action: ActionType) => void;
  /** Rendered as the last element in the same horizontally-scrolling row (e.g. the confirmed postflop board strip). */
  trailing?: React.ReactNode;
}

export function SeatActionBar({
  stackBb,
  actionPath,
  activeSeat,
  availableActions,
  loading,
  onAction,
  onRevisit,
  onQuickAction,
  trailing,
}: SeatActionBarProps) {
  const pendingSeats = activeSeat ? computeRoundActingOrder(actionPath, activeSeat, stackBb).slice(1) : [];

  return (
    <div className="flex flex-nowrap items-start gap-2 overflow-x-auto pb-1">
      {actionPath.map((entry, globalIndex) => (
        <SeatBox
          key={`h-${globalIndex}`}
          kind="history"
          position={entry.actor}
          stackBb={stackBb}
          action={entry}
          onRevisit={() => onRevisit(globalIndex)}
        />
      ))}

      {activeSeat && (
        <SeatBox
          key="active"
          kind="active"
          position={activeSeat}
          stackBb={stackBb}
          availableActions={availableActions}
          loading={loading}
          onAction={onAction}
        />
      )}

      {pendingSeats.map((position) => (
        <SeatBox
          key={`p-${position}`}
          kind="pending"
          position={position}
          stackBb={stackBb}
          quickActions={activeSeat ? previewQuickAction(actionPath, activeSeat, position, stackBb) : null}
          onQuickAction={(action) => onQuickAction(position, action)}
        />
      ))}

      {trailing}
    </div>
  );
}
