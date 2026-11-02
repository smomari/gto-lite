import { STACK_MIN_BB, STACK_MAX_BB } from "@/lib/solveEngine/constants";

interface StackSizeControlProps {
  value: number;
  onChange: (stackBb: number) => void;
  /** Drops the slider and fits one row — the stack stays easy to change without costing much vertical space in a viewport-fit layout. */
  compact?: boolean;
}

export function StackSizeControl({ value, onChange, compact }: StackSizeControlProps) {
  const numberInput = (
    <input
      type="number"
      min={STACK_MIN_BB}
      max={STACK_MAX_BB}
      step={1}
      value={value}
      onChange={(e) => {
        const next = Math.min(STACK_MAX_BB, Math.max(STACK_MIN_BB, Number(e.target.value) || STACK_MIN_BB));
        onChange(next);
      }}
      className={`rounded border border-line-strong bg-transparent font-mono tabular-nums text-ink ${
        compact ? "w-20 px-2 py-1 text-[16px]" : "w-16 px-2 py-1 text-[16px] lg:text-sm"
      }`}
    />
  );

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-ink-muted">Stack</span>
        {numberInput}
        <span className="text-sm text-ink-muted">bb</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium text-ink-muted">Effective stack</span>
      <input
        type="range"
        min={STACK_MIN_BB}
        max={STACK_MAX_BB}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-48"
      />
      {numberInput}
      <span className="text-sm text-ink-muted">bb</span>
    </div>
  );
}
