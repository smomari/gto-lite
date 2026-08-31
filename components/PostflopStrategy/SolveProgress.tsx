interface SolveProgressProps {
  phase: "equity" | "cfr";
  done: number;
  total: number;
}

export function SolveProgress({ phase, done, total }: SolveProgressProps) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const label = phase === "equity" ? "Computing showdown equities…" : "Running CFR…";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
