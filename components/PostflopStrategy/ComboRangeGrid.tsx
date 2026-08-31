import type { SerializedCombo, SerializedDecisionNode } from "@/types/postflopSolver";

interface ComboRangeGridProps {
  /** The acting player's range — must be the range for whichever player `node.actor` is. */
  range: SerializedCombo[];
  node: SerializedDecisionNode;
}

/**
 * Phase 1 shows strategy at the individual-combo level (not the 169-canonical
 * -hand grid the preflop tool uses) — postflop strategy genuinely varies
 * combo-by-combo due to board card removal, so a canonical-hand-level view
 * would hide real information. A plain sorted table is the simplest correct
 * way to show that; a nicer visualization is a later hardening pass.
 */
export function ComboRangeGrid({ range, node }: ComboRangeGridProps) {
  const rows = range
    .map((combo, i) => ({ combo, strategy: node.strategy[i] }))
    .filter((r) => r.combo.weight > 0)
    .sort((a, b) => b.combo.weight - a.combo.weight);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-zinc-500 dark:text-zinc-400">
            <th className="pr-3 font-medium">Combo</th>
            {node.actions.map(({ action }) => (
              <th key={action} className="px-2 font-medium capitalize">
                {action}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ combo, strategy }, i) => (
            <tr key={i} className="border-t border-zinc-200 dark:border-zinc-800">
              <td className="pr-3 py-1 font-mono text-zinc-900 dark:text-zinc-100">{combo.cards.join("")}</td>
              {strategy.map((p, a) => (
                <td key={a} className="px-2 py-1 text-zinc-700 dark:text-zinc-300">
                  {(p * 100).toFixed(0)}%
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
