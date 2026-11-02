import { useEffect, useRef, useState } from "react";
import { StackSizeControl } from "@/components/TableBar/StackSizeControl";
import { ACTIVE_GAME_FORMAT, GAME_FORMATS } from "./gameFormats";

interface SettingsDialogProps {
  stackBb: number;
  onApply: (stackBb: number) => void;
  onClose: () => void;
}

/**
 * Mounted only while open, so the draft always starts from the live stack.
 * The stack is a draft until Apply because changing it restarts the hand and
 * refetches — a slider would otherwise do both on every tick of a drag.
 */
export function SettingsDialog({ stackBb, onApply, onClose }: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedBackdropRef = useRef(false);
  const [draftStackBb, setDraftStackBb] = useState(stackBb);

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
          onApply(draftStackBb);
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
          {GAME_FORMATS.map((format) => (
            <label
              key={format.id}
              className={`flex items-center gap-2 py-1 text-sm ${format.available ? "text-ink" : "text-ink-faint"}`}
            >
              <input
                type="radio"
                name="game-format"
                value={format.id}
                checked={format.id === ACTIVE_GAME_FORMAT.id}
                disabled={!format.available}
                readOnly
                className="accent-accent"
              />
              {format.label}
              {!format.available && <span className="ml-auto text-xs">Coming soon</span>}
            </label>
          ))}
        </fieldset>

        <div className="flex flex-col gap-1">
          <StackSizeControl value={draftStackBb} onChange={setDraftStackBb} />
          <p className="text-xs text-ink-faint">Changing the stack restarts the hand.</p>
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
