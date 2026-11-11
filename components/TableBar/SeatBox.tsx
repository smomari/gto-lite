import type { ActionNode, ActionType, Position } from "@/types/rangeData";
import type { AvailableActions } from "@/types/solveApi";
import { useMessages } from "@/lib/i18n/locale";

type SeatBoxProps =
  | {
      kind: "history";
      position: Position;
      stackBb: number;
      action: ActionNode;
      onRevisit: () => void;
    }
  | {
      kind: "active";
      position: Position;
      stackBb: number;
      availableActions: AvailableActions | null;
      loading: boolean;
      onAction: (action: ActionType) => void;
    }
  | {
      kind: "pending";
      position: Position;
      stackBb: number;
      quickActions: AvailableActions | null;
      onQuickAction: (action: ActionType) => void;
    };

function describeAction(entry: ActionNode): string {
  switch (entry.action) {
    case "fold":
      return "Fold";
    case "call":
      if (entry.label === "limp") return "Limp";
      return entry.label === "check" ? "Check" : "Call";
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
  const t = useMessages();
  const base = `rounded px-2 py-1 text-left text-xs font-medium pointer-coarse:min-h-9 ${
    compact ? "hover:bg-raised" : "bg-raised hover:bg-line-strong"
  }`;
  return (
    <>
      {actions.fold && (
        <button type="button" onClick={() => onClick("fold")} className={`${base} text-ink-muted hover:text-ink`}>
          {t.action("Fold")}
        </button>
      )}
      {actions.call && (
        <button type="button" onClick={() => onClick("call")} className={`${base} text-[#7fa6e0]`}>
          {t.action(actions.call.label)}
        </button>
      )}
      {actions.raise && (
        <button type="button" onClick={() => onClick("raise")} className={`${base} text-[#d3a24a]`}>
          {t.action(`Raise ${actions.raise.toBb}bb`)}
        </button>
      )}
      {actions.allin && (
        <button type="button" onClick={() => onClick("allin")} className={`${base} text-[#d98a82]`}>
          {t.action(`Allin ${actions.allin.toBb}bb`)}
        </button>
      )}
    </>
  );
}

export function SeatBox(props: SeatBoxProps) {
  const t = useMessages();
  const { position, stackBb } = props;
  const isActive = props.kind === "active";
  const isFolded = props.kind === "history" && props.action.action === "fold";

  return (
    <div
      data-testid="seat-box"
      data-kind={props.kind}
      data-position={position}
      className={`flex shrink-0 flex-col gap-1 rounded-md p-2 ${
        isActive
          ? "min-w-[120px] bg-surface shadow-[inset_0_0_0_1px_var(--color-line-strong),inset_2px_0_0_var(--color-accent)]"
          : isFolded
            ? "min-w-[76px] opacity-60"
            : "min-w-[92px]"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold text-ink">{position}</span>
        <span className="font-mono tabular-nums text-ink-faint">{stackBb}</span>
      </div>

      {props.kind === "history" && (
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={props.onRevisit}
            className="rounded py-0.5 text-left text-xs text-ink-muted hover:text-ink"
            title={t.preflop.undoHere}
          >
            {t.action(describeAction(props.action))}
          </button>
        </div>
      )}

      {props.kind === "active" && (
        <div className="flex flex-col gap-1">
          {props.loading ? (
            <span className="text-xs text-ink-faint">...</span>
          ) : (
            props.availableActions && (
              <ActionButtons actions={props.availableActions} onClick={props.onAction} compact={false} />
            )
          )}
        </div>
      )}

      {props.kind === "pending" && (
        <div className="flex flex-col gap-0.5">
          {props.quickActions ? (
            <ActionButtons actions={props.quickActions} onClick={props.onQuickAction} compact={true} />
          ) : (
            <span className="text-xs text-ink-faint">—</span>
          )}
        </div>
      )}
    </div>
  );
}
