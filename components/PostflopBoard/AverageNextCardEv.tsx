import { MAX_PRECISE_SAMPLE_COUNT } from "@/lib/postflopSolver/nextCardSampling";

export type PreciseAvgState =
  | { kind: "idle" }
  | { kind: "solving"; sampleIndex: number; sampleCount: number }
  | {
      kind: "done";
      samples: { card: string; heroEvBb: number; villainEvBb: number }[];
      avgHeroEvBb: number;
      avgVillainEvBb: number;
    }
  | { kind: "error"; message: string };

interface AverageNextCardEvProps {
  state: PreciseAvgState;
  heroLabel: string;
  villainLabel: string;
  sampleCount: number;
  onCompute: () => void;
  onCancel: () => void;
}

function formatBb(bb: number): string {
  return `${bb >= 0 ? "+" : ""}${bb.toFixed(2)}bb`;
}

/**
 * Opt-in "precise average EV" feature: unlike CheckdownEquityNote's free,
 * instant checked-down number, this actually re-solves a handful of
 * representative next-street boards (real CFR, real continued betting) and
 * averages the results — real value, but real cost (N times a normal solve).
 * Never runs on its own; only in response to the button click below.
 */
export function AverageNextCardEv({ state, heroLabel, villainLabel, sampleCount, onCompute, onCancel }: AverageNextCardEvProps) {
  return (
    <div className="flex flex-col gap-1">
      {state.kind === "idle" && (
        <button
          type="button"
          onClick={onCompute}
          className="self-start text-xs text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          Compute precise average EV ({sampleCount} card{sampleCount === 1 ? "" : "s"} re-solved — can take a while,
          up to {MAX_PRECISE_SAMPLE_COUNT} cards supported)
        </button>
      )}

      {state.kind === "solving" && (
        <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
          <span>
            Solving card {state.sampleIndex + 1}/{state.sampleCount}…
          </span>
          <button type="button" onClick={onCancel} className="underline hover:text-zinc-900 dark:hover:text-zinc-100">
            Cancel
          </button>
        </div>
      )}

      {state.kind === "done" && (
        <div className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
          <table className="w-fit">
            <tbody>
              {state.samples.map((s) => (
                <tr key={s.card}>
                  <td className="pr-3">{s.card}</td>
                  <td className="pr-3">
                    {heroLabel} {formatBb(s.heroEvBb)}
                  </td>
                  <td>
                    {villainLabel} {formatBb(s.villainEvBb)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="font-medium text-zinc-700 dark:text-zinc-300">
            Average: {heroLabel} {formatBb(state.avgHeroEvBb)} · {villainLabel} {formatBb(state.avgVillainEvBb)}
          </p>
          <p>
            Unlike the checkdown value above, this reflects a real re-solved equilibrium (with further betting) on
            each sampled card — a representative sample, not all remaining cards.
          </p>
        </div>
      )}

      {state.kind === "error" && <p className="text-sm text-red-600 dark:text-red-400">Error: {state.message}</p>}
    </div>
  );
}
