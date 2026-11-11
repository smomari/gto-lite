import { useEffect, useRef, useState } from "react";
import { StackSizeControl } from "@/components/TableBar/StackSizeControl";
import { GAME_FORMATS, type GameFormat } from "@/lib/solveEngine/gameFormat";
import { RAKE_PRESETS, rakeSummary, type RakeSettings } from "@/lib/solveEngine/rake";
import { ICM_PRESETS, type IcmStructure } from "@/lib/solveEngine/icm";
import { useMessages } from "@/lib/i18n/locale";

interface SettingsDialogProps {
  format: GameFormat;
  rake: RakeSettings;
  icm: IcmStructure;
  stackBb: number;
  onApply: (stackBb: number, format: GameFormat, rake: RakeSettings, icm: IcmStructure) => void;
  onClose: () => void;
}

/**
 * Mounted only while open, so the drafts always start from the live table.
 * They are drafts until Apply because changing any of them restarts the hand and
 * refetches — a slider would otherwise do both on every tick of a drag.
 */
export function SettingsDialog({ format, rake, icm, stackBb, onApply, onClose }: SettingsDialogProps) {
  const t = useMessages();
  /** Through the dialog's own close, which hands focus back; its close event then reaches onClose. */
  const close = () => dialogRef.current?.close();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedBackdropRef = useRef(false);
  const [draftStackBb, setDraftStackBb] = useState(stackBb);
  const [draftFormat, setDraftFormat] = useState(format);
  const [draftRake, setDraftRake] = useState(rake);
  const [draftIcm, setDraftIcm] = useState(icm);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="settings-title"
      onClose={onClose}
      // Press and release both count: a slider drag released past the edge also clicks the dialog itself.
      onMouseDown={(e) => {
        pressedBackdropRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pressedBackdropRef.current && e.target === e.currentTarget) close();
      }}
      className={`m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-lg border border-line-strong bg-surface p-0 text-ink backdrop:bg-black/60 ${
        draftFormat.allowsRake || draftFormat.allowsIcm ? "sm:max-w-xl" : ""
      }`}
    >
      <form
        className="flex flex-col gap-4 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          close();
          onApply(draftStackBb, draftFormat, draftRake, draftIcm);
        }}
      >
        <div className="flex items-center justify-between">
          <h2 id="settings-title" className="text-base font-semibold">
            {t.settings.title}
          </h2>
          <button
            type="button"
            aria-label={t.settings.close}
            onClick={close}
            className="rounded px-2 py-0.5 text-base text-ink-muted hover:bg-raised hover:text-ink pointer-coarse:min-h-9"
          >
            ×
          </button>
        </div>

        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium text-ink-muted">{t.settings.game}</legend>
          {GAME_FORMATS.map((option) => (
            <label key={option.id} className="flex items-center gap-2 py-1 text-sm text-ink">
              <input
                type="radio"
                name="game-format"
                value={option.id}
                checked={option === draftFormat}
                onChange={() => setDraftFormat(option)}
                className="accent-accent"
              />
              {t.formats[option.id]}
            </label>
          ))}
          <p className="text-xs text-ink-faint">{t.settings.cashNote}</p>
        </fieldset>

        {draftFormat.allowsRake && (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-medium text-ink-muted">{t.settings.rake}</legend>
            <div className="grid gap-x-4 sm:grid-cols-2">
              {RAKE_PRESETS.map((option) => (
                <label key={option.id} className="flex items-center gap-2 py-1 text-sm text-ink">
                  <input
                    type="radio"
                    name="rake"
                    value={option.id}
                    checked={option === draftRake.structure}
                    onChange={() => setDraftRake({ ...draftRake, structure: option })}
                    className="accent-accent"
                  />
                  {t.rakes[option.id].label}
                  {option.rate > 0 && <span className="font-mono text-xs tabular-nums text-ink-muted">{rakeSummary(option)}</span>}
                  <span className="ml-auto text-xs text-ink-faint">{t.rakes[option.id].stakes}</span>
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 py-1 text-sm text-ink">
              <input
                type="checkbox"
                checked={draftRake.noFlopNoDrop}
                onChange={(e) => setDraftRake({ ...draftRake, noFlopNoDrop: e.target.checked })}
                className="accent-accent"
              />
              {t.settings.noFlopNoDrop}
            </label>
          </fieldset>
        )}

        {draftFormat.allowsIcm && (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-medium text-ink-muted">{t.settings.icm}</legend>
            <div className="grid gap-x-4 sm:grid-cols-2">
              {ICM_PRESETS.map((option) => (
                <label key={option.id} className="flex items-center gap-2 py-1 text-sm text-ink">
                  <input
                    type="radio"
                    name="icm"
                    value={option.id}
                    checked={option === draftIcm}
                    onChange={() => setDraftIcm(option)}
                    className="accent-accent"
                  />
                  {t.icm[option.id].label}
                  <span className="ml-auto text-xs text-ink-faint">{t.icm[option.id].stage}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-ink-faint">{t.settings.icmNote}</p>
          </fieldset>
        )}

        <div className="flex flex-col gap-1">
          <StackSizeControl value={draftStackBb} onChange={setDraftStackBb} />
          <p className="text-xs text-ink-faint">{t.settings.restartNote}</p>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded px-3 py-1.5 text-sm text-ink-muted hover:bg-raised hover:text-ink pointer-coarse:min-h-11"
          >
            {t.settings.cancel}
          </button>
          <button type="submit" className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-canvas pointer-coarse:min-h-11">
            {t.settings.apply}
          </button>
        </div>
      </form>
    </dialog>
  );
}
