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

/**
 * Whether this page can't share memory with its workers, as in some in-app
 * browsers: the solver then runs on one thread (wasm/loadWeb.ts), several
 * times slower. Unknown outside a browser.
 */
const oneThreadOnly = () => typeof crossOriginIsolated !== "undefined" && !crossOriginIsolated;

export function SolveProgress(props: SolveProgressProps) {
  const t = useMessages();
  return (
    <div className="flex flex-col gap-1.5">
      <ProgressBar {...props} />
      {oneThreadOnly() && <p className="text-xs text-ink-faint">{t.solve.oneThread}</p>}
    </div>
  );
}

function ProgressBar({ phase, done, total, exploitabilityPercent, targetExploitabilityPercent }: SolveProgressProps) {
  const t = useMessages();
  if (phase !== "equity") {
    // A flop's first pass is a solve too, but its reading isn't the shown solve's, so it isn't printed.
    const label = phase === "sizes" ? t.solve.pickingSizes : t.solve.runningCfr;
    return (
      <div role="progressbar" aria-label={label} className="flex flex-col gap-1">
        <div className="flex justify-between text-xs text-ink-muted">
          <span>{label}…</span>
          {phase === "cfr" && (
            <span>
              {exploitabilityPercent !== undefined
                ? t.solve.exploitability(exploitabilityPercent.toFixed(2))
                : t.solve.measuring}
              {targetExploitabilityPercent !== undefined && t.solve.target(targetExploitabilityPercent.toFixed(2))}
            </span>
          )}
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
