import type { GameFormat } from "@/lib/solveEngine/gameFormat";
import { rakeSummary, type RakeStructure } from "@/lib/solveEngine/rake";
import { isChipEv, type IcmStructure } from "@/lib/solveEngine/icm";
import { useMessages } from "@/lib/i18n/locale";

interface SettingsButtonProps {
  format: GameFormat;
  rake: RakeStructure;
  icm: IcmStructure;
  stackBb: number;
  onClick: () => void;
}

export function SettingsButton({ format, rake, icm, stackBb, onClick }: SettingsButtonProps) {
  const t = useMessages();
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 items-center gap-2 rounded border border-line-strong px-2 py-1 text-sm text-ink-muted hover:bg-raised hover:text-ink pointer-coarse:min-h-9"
    >
      {/* A phone's header has room for the short name only, and cuts even that off rather than push the gear out. */}
      <span className="min-w-0 truncate">
        <span className="sm:hidden">{t.formatsShort[format.id]}</span>
        <span className="hidden sm:inline">{t.formats[format.id]}</span> · <span className="font-mono tabular-nums">{stackBb}</span>bb
        {format.allowsRake && <span className="hidden sm:inline"> · {rake.rate === 0 ? t.rakes[rake.id].label : rakeSummary(rake)}</span>}
        {format.allowsIcm && !isChipEv(icm) && <span className="hidden sm:inline"> · {t.settings.icmStage(t.icm[icm.id].label)}</span>}
      </span>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-2.82-1.17l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0-1.17-2.82H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.17-2.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 2.82-1.17V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 2.82 1.17l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0 1.17 2.82H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
      <span className="sr-only">{t.settings.title}</span>
    </button>
  );
}
