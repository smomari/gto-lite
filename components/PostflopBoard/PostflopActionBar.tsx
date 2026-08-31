import type { PostflopPlayer } from "@/lib/postflopSolver/potState";
import type { SerializedDecisionAction, SerializedTreeNode } from "@/types/postflopSolver";
import { PostflopSeatBox } from "./PostflopSeatBox";

interface PostflopHistoryEntry {
  actor: PostflopPlayer;
  label: string;
}

interface PostflopActionBarProps {
  node: SerializedTreeNode;
  history: PostflopHistoryEntry[];
  heroLabel: string;
  villainLabel: string;
  onNavigate: (action: SerializedDecisionAction) => void;
}

export function PostflopActionBar({ node, history, heroLabel, villainLabel, onNavigate }: PostflopActionBarProps) {
  const seatLabel = (actor: PostflopPlayer) => (actor === "P1" ? heroLabel : villainLabel);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {history.map((entry, i) => (
          <PostflopSeatBox key={i} kind="history" seatLabel={seatLabel(entry.actor)} label={entry.label} />
        ))}

        {node.type === "decision" && (
          <PostflopSeatBox
            kind="active"
            seatLabel={seatLabel(node.actor)}
            potBb={node.potBb}
            currentBetToCall={node.currentBetToCall}
            actions={node.actions}
            onNavigate={onNavigate}
          />
        )}
      </div>

      {node.type !== "decision" && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {node.type === "terminal-fold"
            ? `${seatLabel(node.winner!)} wins uncontested — pot ${node.potBb.toFixed(1)}bb.`
            : `Street ends (checked/called through) — pot ${node.potBb.toFixed(1)}bb, runs out to the river.`}
        </p>
      )}
    </div>
  );
}
