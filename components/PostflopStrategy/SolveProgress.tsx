interface SolveProgressProps {
  phase: "equity" | "cfr";
  done: number;
  total: number;
  /** Latest periodic exploitability reading during the CFR phase (% of pot). Undefined until the first check fires. */
  exploitabilityPercent?: number;
  /** The CFR phase's early-stop target (% of pot), for display next to the live reading. */
  targetExploitabilityPercent?: number;
}

export function SolveProgress({ phase, done, total, exploitabilityPercent, targetExploitabilityPercent }: SolveProgressProps) {
  if (phase === "cfr") {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <span>Running CFR…</span>
          <span>
            {exploitabilityPercent !== undefined
              ? `exploitability ${exploitabilityPercent.toFixed(2)}% pot`
              : "measuring…"}
            {targetExploitabilityPercent !== undefined && ` (target ${targetExploitabilityPercent.toFixed(2)}%)`}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div className="h-full w-full animate-pulse bg-emerald-500" />
        </div>
      </div>
    );
  }

  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
        <span>Computing showdown equities…</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
