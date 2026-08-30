import type { ActionNode, ActionType, Position } from "@/types/rangeData";
import type { AvailableActions } from "@/types/solveApi";

interface HistoryItem {
  entry: ActionNode;
  globalIndex: number;
}

interface SeatBoxProps {
  position: Position;
  stackBb: number;
  history: HistoryItem[];
  isActive: boolean;
  isFolded: boolean;
  availableActions: AvailableActions | null;
  loading: boolean;
  onAction: (action: ActionType) => void;
  onRevisit: (globalIndex: number) => void;
  /**
   * For a not-yet-reached seat after the active one: what its Fold/Call/Raise/
   * Allin options would be if every seat between the active one and this seat
   * folded first. Null when that isn't a reachable spot (e.g. it would already
   * resolve the hand before this seat gets a turn).
   */
  quickActions: AvailableActions | null;
  onQuickAction: (action: ActionType) => void;
}

function describeAction(entry: ActionNode): string {
  switch (entry.action) {
    case "fold":
      return "Fold";
    case "call":
      return "Call";
    case "raise":
      return `Raise ${entry.sizeBb}bb`;
    case "allin":
      return `Allin ${entry.sizeBb}bb`;
  }
}

interface ActionButtonsProps {
  actions: AvailableActions;
  onClick: (action: ActionType) => void;
  compact: boolean;
}

function ActionButtons({ actions, onClick, compact }: ActionButtonsProps) {
  const base = compact
    ? "rounded px-1.5 py-0.5 text-left text-xs"
    : "rounded px-2 py-1 text-left text-xs font-medium";
  return (
    <>
      <button
        type="button"
        onClick={() => onClick("fold")}
        className={`${base} ${
          compact
            ? "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        }`}
      >
        Fold
      </button>
      {actions.call && (
        <button
          type="button"
          onClick={() => onClick("call")}
          className={`${base} ${
            compact
              ? "text-blue-500 hover:bg-blue-50 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
              : "bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60"
          }`}
        >
          {actions.call.label}
        </button>
      )}
      {actions.raise && (
        <button
          type="button"
          onClick={() => onClick("raise")}
          className={`${base} ${
            compact
              ? "text-orange-500 hover:bg-orange-50 hover:text-orange-700 dark:text-orange-400 dark:hover:bg-orange-950/40 dark:hover:text-orange-300"
              : "bg-orange-100 text-orange-800 hover:bg-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:hover:bg-orange-900/60"
          }`}
        >
          Raise {actions.raise.toBb}bb
        </button>
      )}
      <button
        type="button"
        onClick={() => onClick("allin")}
        className={`${base} ${
          compact
            ? "text-red-500 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30 dark:hover:text-red-300"
            : "bg-red-100 text-red-900 hover:bg-red-200 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-950/70"
        }`}
      >
        Allin {actions.allin.toBb}bb
      </button>
    </>
  );
}

export function SeatBox({
  position,
  stackBb,
  history,
  isActive,
  isFolded,
  availableActions,
  loading,
  onAction,
  onRevisit,
  quickActions,
  onQuickAction,
}: SeatBoxProps) {
  return (
    <div
      className={`flex min-w-[130px] flex-col gap-1.5 rounded-lg border p-2.5 ${
        isActive
          ? "border-emerald-500 ring-1 ring-emerald-500"
          : isFolded
            ? "border-zinc-200 opacity-50 dark:border-zinc-800"
            : "border-zinc-300 dark:border-zinc-700"
      }`}
    >
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">{position}</span>
        <span className="text-zinc-500 dark:text-zinc-400">{stackBb}bb</span>
      </div>

      {history.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {history.map(({ entry, globalIndex }, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onRevisit(globalIndex)}
              className="rounded px-1.5 py-0.5 text-left text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              title="Click to undo back to this point"
            >
              {describeAction(entry)}
            </button>
          ))}
        </div>
      )}

      {isActive && (
        <div className="flex flex-col gap-1">
          {loading ? (
            <span className="text-xs text-zinc-400">...</span>
          ) : (
            availableActions && <ActionButtons actions={availableActions} onClick={onAction} compact={false} />
          )}
        </div>
      )}

      {!isActive && history.length === 0 && (
        <div className="flex flex-col gap-0.5">
          {quickActions ? (
            <ActionButtons actions={quickActions} onClick={onQuickAction} compact={true} />
          ) : (
            <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>
          )}
        </div>
      )}
    </div>
  );
}
