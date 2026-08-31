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
      onNavigate: (action: SerializedDecisionAction) => void;
    };

export function PostflopSeatBox(props: PostflopSeatBoxProps) {
  const isActive = props.kind === "active";

  return (
    <div
      data-testid="postflop-seat-box"
      data-kind={props.kind}
      data-seat={props.seatLabel}
      className={`flex min-w-[150px] flex-col gap-1.5 rounded-lg border p-2.5 ${
        isActive
          ? "border-emerald-500 ring-1 ring-emerald-500"
          : "border-zinc-300 dark:border-zinc-700"
      }`}
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{props.seatLabel}</span>
        {props.kind === "active" && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            pot {props.potBb.toFixed(1)}bb
            {props.currentBetToCall > 0 && ` · facing ${props.currentBetToCall.toFixed(1)}bb`}
          </span>
        )}
      </div>

      {props.kind === "history" && (
        <span className="rounded px-1.5 py-0.5 text-left text-xs text-zinc-500 dark:text-zinc-400">
          {props.label}
        </span>
      )}

      {props.kind === "active" && (
        <div className="flex flex-wrap gap-1">
          {props.actions.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={() => props.onNavigate(a)}
              className="rounded bg-zinc-100 px-2 py-1 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
