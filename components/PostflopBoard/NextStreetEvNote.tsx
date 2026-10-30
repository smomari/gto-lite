import { formatSignedBb } from "@/lib/format";

interface NextStreetEvNoteProps {
  ev: { heroEvBb: number; villainEvBb: number };
  heroLabel: string;
  villainLabel: string;
  nextStreetLabel: string;
}

/**
 * The solved value of continuing the hand, averaged over every card that can
 * come next — available when the street was solved together with the next one
 * (a turn solve includes every river), unlike the checkdown estimate.
 */
export function NextStreetEvNote({ ev, heroLabel, villainLabel, nextStreetLabel }: NextStreetEvNoteProps) {
  return (
    <p className="text-xs text-zinc-500 dark:text-zinc-400">
      Solved avg EV over every {nextStreetLabel.toLowerCase()} card (with further betting): {heroLabel}{" "}
      {formatSignedBb(ev.heroEvBb)} · {villainLabel} {formatSignedBb(ev.villainEvBb)}
    </p>
  );
}
