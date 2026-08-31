import type { SerializedTreeNode } from "@/types/postflopSolver";

interface PostflopActionBarProps {
  node: SerializedTreeNode;
  onNavigate: (node: SerializedTreeNode) => void;
}

export function PostflopActionBar({ node, onNavigate }: PostflopActionBarProps) {
  if (node.type !== "decision") {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {node.type === "terminal-fold"
          ? `${node.winner === "P1" ? "OOP" : "IP"} wins uncontested — pot ${node.potBb.toFixed(1)}bb.`
          : `Street ends (checked/called through) — pot ${node.potBb.toFixed(1)}bb, runs out to the river.`}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {node.actor === "P1" ? "OOP" : "IP"} to act · pot {node.potBb.toFixed(1)}bb
        {node.currentBetToCall > 0 && ` · facing ${node.currentBetToCall.toFixed(1)}bb`}
      </p>
      <div className="flex flex-wrap gap-2">
        {node.actions.map((a, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onNavigate(a.child)}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
