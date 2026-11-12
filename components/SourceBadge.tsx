import Link from "next/link";
import type { RangeSource } from "@/types/rangeData";
import type { IcmId } from "@/lib/solveEngine/icm";
import { useMessages } from "@/lib/i18n/locale";

/**
 * How the ranges on screen were worked out, linking to the page that explains
 * it. With `icm`, they were priced in prize money at that stage.
 */
export function SourceBadge({ source, icm }: { source: RangeSource; icm?: IcmId }) {
  const t = useMessages();
  const estimated = source === "heuristic-approx";
  return (
    <Link
      href="/about#preflop"
      title={estimated ? t.preflop.estimatedTitle : t.preflop.nashTitle}
      className={`text-xs font-medium underline decoration-dotted underline-offset-2 hover:decoration-solid ${estimated ? "text-ink-muted" : "text-accent"}`}
    >
      {estimated ? t.preflop.estimated : t.preflop.nash}
      {icm && ` · ${t.settings.icmStage(t.icm[icm].label)}`}
    </Link>
  );
}
