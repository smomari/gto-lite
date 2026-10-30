import { formatSignedBb } from "@/lib/format";

interface NextStreetEvNoteProps {
  ev: { heroEvBb: number; villainEvBb: number };
  heroLabel: string;
  villainLabel: string;
  nextStreetLabel: string;
}

/**
 * The value of continuing the hand from the solve's lookahead — a sample of
 * next cards with a reduced bet menu (see solvePostflop.ts's lookaheadOptions),
 * so it includes later betting, unlike the checkdown estimate, but only
 * approximately.
 */
export function NextStreetEvNote({ ev, heroLabel, villainLabel, nextStreetLabel }: NextStreetEvNoteProps) {
  return (
    <p className="text-xs text-zinc-500 dark:text-zinc-400">
      Lookahead avg EV over the {nextStreetLabel.toLowerCase()} (sampled cards, simplified later betting): {heroLabel}{" "}
      {formatSignedBb(ev.heroEvBb)} · {villainLabel} {formatSignedBb(ev.villainEvBb)}
    </p>
  );
}
