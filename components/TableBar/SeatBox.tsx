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
  /** True for a not-yet-reached seat after the active one — offers a one-click "fold up to here" shortcut. */
  showQuickFold: boolean;
  onQuickFold: () => void;
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
  showQuickFold,
  onQuickFold,
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
            availableActions && (
              <>
                <button
                  type="button"
                  onClick={() => onAction("fold")}
                  className="rounded bg-zinc-100 px-2 py-1 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  Fold
                </button>
                {availableActions.call && (
                  <button
                    type="button"
                    onClick={() => onAction("call")}
                    className="rounded bg-blue-100 px-2 py-1 text-left text-xs font-medium text-blue-800 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60"
                  >
                    {availableActions.call.label}
                  </button>
                )}
                {availableActions.raise && (
                  <button
                    type="button"
                    onClick={() => onAction("raise")}
                    className="rounded bg-orange-100 px-2 py-1 text-left text-xs font-medium text-orange-800 hover:bg-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:hover:bg-orange-900/60"
                  >
                    Raise {availableActions.raise.toBb}bb
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onAction("allin")}
                  className="rounded bg-red-100 px-2 py-1 text-left text-xs font-medium text-red-900 hover:bg-red-200 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-950/70"
                >
                  Allin {availableActions.allin.toBb}bb
                </button>
              </>
            )
          )}
        </div>
      )}

      {!isActive && history.length === 0 && (
        showQuickFold ? (
          <button
            type="button"
            onClick={onQuickFold}
            className="rounded px-1.5 py-0.5 text-left text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            title="Fold this seat and every seat before it"
          >
            Fold
          </button>
        ) : (
          <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>
        )
      )}
    </div>
  );
}
