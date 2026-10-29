import type { SerializedTerminalNode } from "@/types/postflopSolver";

interface PostflopTerminalMessageProps {
  node: SerializedTerminalNode;
  heroLabel: string;
  villainLabel: string;
  /** Wording for a terminal-showdown, which depends on what comes next (another street, all-in runout, or the end of the hand). */
  showdownMessage: (potBb: number) => string;
}

/** How the street ended, shown in place of an active seat box once its action is over. */
export function PostflopTerminalMessage({ node, heroLabel, villainLabel, showdownMessage }: PostflopTerminalMessageProps) {
  const winnerLabel = node.winner === "P1" ? heroLabel : villainLabel;
  return (
    <p className="text-sm text-zinc-500 dark:text-zinc-400">
      {node.type === "terminal-fold"
        ? `${winnerLabel} wins uncontested — pot ${node.potBb.toFixed(1)}bb.`
        : showdownMessage(node.potBb)}
    </p>
  );
}
