import type { SerializedDecisionAction } from "@/types/postflopSolver";

type PostflopSeatBoxProps =
  | {
      kind: "history";
      seatLabel: string;
      label: string;
    }
  | {
      kind: "active";
      seatLabel: string;
      potBb: number;
      currentBetToCall: number;
      actions: SerializedDecisionAction[];
      /** Colors per action instance, index-aligned to `actions` (see `buildActionColorScale`). */
      actionColors: string[];
      onNavigate: (action: SerializedDecisionAction) => void;
    };

export function PostflopSeatBox(props: PostflopSeatBoxProps) {
  const isActive = props.kind === "active";

  return (
    <div
      data-testid="postflop-seat-box"
      data-kind={props.kind}
      data-seat={props.seatLabel}
      className={`flex shrink-0 flex-col gap-1 rounded-md p-2 ${
        isActive ? "bg-surface shadow-[inset_0_0_0_1px_var(--color-line-strong),inset_2px_0_0_var(--color-accent)]" : "min-w-[76px] opacity-70"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold text-ink">{props.seatLabel}</span>
        {props.kind === "active" && (
          <span className="font-mono tabular-nums text-ink-faint">
            pot {props.potBb.toFixed(1)}bb
            {props.currentBetToCall > 0 && ` · facing ${props.currentBetToCall.toFixed(1)}bb`}
          </span>
        )}
      </div>

      {props.kind === "history" && <span className="py-0.5 text-left text-xs text-ink-muted">{props.label}</span>}

      {props.kind === "active" && (
        <div className="flex flex-nowrap gap-1">
          {props.actions.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={() => props.onNavigate(a)}
              className="flex items-center gap-1.5 whitespace-nowrap rounded bg-raised px-2 py-1 text-left text-xs font-medium text-ink transition pointer-coarse:min-h-9 hover:bg-line-strong"
            >
              <span aria-hidden className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: props.actionColors[i] }} />
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
