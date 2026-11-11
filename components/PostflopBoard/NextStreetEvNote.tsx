import { formatSignedBb } from "@/lib/format";
import { useMessages } from "@/lib/i18n/locale";
import type { StreetLabel } from "./streetLabel";

interface NextStreetEvNoteProps {
  ev: { heroEvBb: number; villainEvBb: number };
  heroLabel: string;
  villainLabel: string;
  nextStreetLabel: StreetLabel;
}

/**
 * The value of continuing the hand from the solve's lookahead — a sample of
 * next cards with a reduced bet menu (see solvePostflop.ts's lookaheadOptions),
 * so it includes later betting, unlike the checkdown estimate, but only
 * approximately.
 */
export function NextStreetEvNote({ ev, heroLabel, villainLabel, nextStreetLabel }: NextStreetEvNoteProps) {
  const t = useMessages();
  return (
    <p className="text-xs text-ink-muted">
      {t.postflop.lookahead(nextStreetLabel)} {heroLabel}{" "}
      {formatSignedBb(ev.heroEvBb)} · {villainLabel} {formatSignedBb(ev.villainEvBb)}
    </p>
  );
}
