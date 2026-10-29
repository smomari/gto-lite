import type { PostflopPlayer } from "@/lib/postflopSolver/potState";
import type { SerializedDecisionAction, SerializedTreeNode } from "@/types/postflopSolver";
import { buildActionColorScale } from "@/components/PostflopStrategy/postflopColorLegend";
import { PostflopSeatBox } from "./PostflopSeatBox";

interface PostflopHistoryEntry {
  actor: PostflopPlayer;
  label: string;
}

interface PostflopActionBarProps {
  /** Only a decision node gets an active (to-act) box; a terminal just ends the street's run of boxes. */
  node: SerializedTreeNode | null;
  history: PostflopHistoryEntry[];
  heroLabel: string;
  villainLabel: string;
  onNavigate: (action: SerializedDecisionAction) => void;
}

/** One street's seat boxes, returned unwrapped so they sit directly in the seat-bar row next to the preflop boxes. */
export function PostflopActionBar({ node, history, heroLabel, villainLabel, onNavigate }: PostflopActionBarProps) {
  const seatLabel = (actor: PostflopPlayer) => (actor === "P1" ? heroLabel : villainLabel);

  return (
    <>
      {history.map((entry, i) => (
        <PostflopSeatBox key={i} kind="history" seatLabel={seatLabel(entry.actor)} label={entry.label} />
      ))}

      {node?.type === "decision" && (
        <PostflopSeatBox
          kind="active"
          seatLabel={seatLabel(node.actor)}
          potBb={node.potBb}
          currentBetToCall={node.currentBetToCall}
          actions={node.actions}
          actionColors={buildActionColorScale(node.actions)}
          onNavigate={onNavigate}
        />
      )}
    </>
  );
}
