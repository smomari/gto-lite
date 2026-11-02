import { useEffect, useRef, useState } from "react";
import { StackSizeControl } from "@/components/TableBar/StackSizeControl";
import { GAME_FORMATS, type GameFormat } from "@/lib/solveEngine/gameFormat";

interface SettingsDialogProps {
  format: GameFormat;
  stackBb: number;
  onApply: (stackBb: number, format: GameFormat) => void;
  onClose: () => void;
}

/**
 * Mounted only while open, so the drafts always start from the live table.
 * Both are drafts until Apply because changing either restarts the hand and
 * refetches — a slider would otherwise do both on every tick of a drag.
 */
export function SettingsDialog({ format, stackBb, onApply, onClose }: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedBackdropRef = useRef(false);
  const [draftStackBb, setDraftStackBb] = useState(stackBb);
  const [draftFormat, setDraftFormat] = useState(format);

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
        if (pressedBackdropRef.current && e.target === e.currentTarget) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-lg border border-line-strong bg-surface p-0 text-ink backdrop:bg-black/60"
    >
      <form
        className="flex flex-col gap-4 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          onApply(draftStackBb, draftFormat);
        }}
      >
        <div className="flex items-center justify-between">
          <h2 id="settings-title" className="text-base font-semibold">
            Settings
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded px-2 py-0.5 text-base text-ink-muted hover:bg-raised hover:text-ink pointer-coarse:min-h-9"
          >
            ×
          </button>
        </div>

        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium text-ink-muted">Game</legend>
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
              {option.label}
            </label>
          ))}
          <p className="text-xs text-ink-faint">Cash charts are estimates. Rake isn&apos;t modeled.</p>
        </fieldset>

        <div className="flex flex-col gap-1">
          <StackSizeControl value={draftStackBb} onChange={setDraftStackBb} />
          <p className="text-xs text-ink-faint">Changing these restarts the hand.</p>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm text-ink-muted hover:bg-raised hover:text-ink pointer-coarse:min-h-11"
          >
            Cancel
          </button>
          <button type="submit" className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-canvas pointer-coarse:min-h-11">
            Apply
          </button>
        </div>
      </form>
    </dialog>
  );
}
