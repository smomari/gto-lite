import { useEffect, useRef } from "react";
import type { ActionNode, ActionType, Position } from "@/types/rangeData";
import type { AvailableActions } from "@/types/solveApi";
import type { GameFormat } from "@/lib/solveEngine/gameFormat";
import { computeRoundActingOrder, previewQuickAction } from "@/lib/solveEngine/preview";
import { SeatBox } from "./SeatBox";

interface SeatActionBarProps {
  stackBb: number;
  format: GameFormat;
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
  format,
  actionPath,
  activeSeat,
  availableActions,
  loading,
  onAction,
  onRevisit,
  onQuickAction,
  trailing,
}: SeatActionBarProps) {
  const pendingSeats = activeSeat ? computeRoundActingOrder(actionPath, activeSeat, stackBb, format).slice(1) : [];
  const rowRef = useRef<HTMLDivElement>(null);

  // Once a re-raise sends action back around the table, the row grows past
  // the viewport and the seat to act lands off-screen — keep it in view, or,
  // once the hand is over, show the latest action and the board.
  useEffect(() => {
    const row = rowRef.current;
    if (!row || loading) return;
    const activeBox = row.querySelector<HTMLElement>('[data-kind="active"]');
    if (activeBox) activeBox.scrollIntoView({ block: "nearest", inline: "nearest" });
    else row.scrollLeft = row.scrollWidth;
  }, [activeSeat, actionPath.length, loading]);

  return (
    <div ref={rowRef} className="flex flex-nowrap items-start gap-1 overflow-x-auto border-b border-line pb-2">
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
          quickActions={activeSeat ? previewQuickAction(actionPath, activeSeat, position, stackBb, format) : null}
          onQuickAction={(action) => onQuickAction(position, action)}
        />
      ))}

      {trailing}
    </div>
  );
}
