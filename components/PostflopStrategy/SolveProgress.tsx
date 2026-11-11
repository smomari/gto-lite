import type { PostflopSolvePhase } from "@/types/postflopSolver";
import { useMessages } from "@/lib/i18n/locale";

interface SolveProgressProps {
  phase: PostflopSolvePhase;
  done: number;
  total: number;
  /** Latest periodic exploitability reading during the CFR phase (% of pot). Undefined until the first check fires. */
  exploitabilityPercent?: number;
  /** The CFR phase's early-stop target (% of pot), for display next to the live reading. */
  targetExploitabilityPercent?: number;
}

export function SolveProgress({ phase, done, total, exploitabilityPercent, targetExploitabilityPercent }: SolveProgressProps) {
  const t = useMessages();
  if (phase === "cfr") {
    return (
      <div role="progressbar" aria-label={t.solve.runningCfr} className="flex flex-col gap-1">
        <div className="flex justify-between text-xs text-ink-muted">
          <span>{t.solve.runningCfr}…</span>
          <span>
            {exploitabilityPercent !== undefined
              ? t.solve.exploitability(exploitabilityPercent.toFixed(2))
              : t.solve.measuring}
            {targetExploitabilityPercent !== undefined && t.solve.target(targetExploitabilityPercent.toFixed(2))}
          </span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-[1px] bg-raised">
          <div className="h-full w-full animate-pulse bg-accent" />
        </div>
      </div>
    );
  }

  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  return (
    <div role="progressbar" aria-label={t.solve.computingEquities} aria-valuenow={pct} className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-ink-muted">
        <span>{t.solve.computingEquities}…</span>
        <span className="font-mono tabular-nums">{pct}%</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-[1px] bg-raised">
        <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
