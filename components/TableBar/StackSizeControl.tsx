import { STACK_MIN_BB, STACK_MAX_BB } from "@/lib/solveEngine/constants";

interface StackSizeControlProps {
  value: number;
  onChange: (stackBb: number) => void;
  /** Drops the slider and shrinks to a single thin row — just enough to still change the stack without costing vertical space in a viewport-fit layout. */
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
      className={`rounded-md border border-zinc-300 bg-transparent dark:border-zinc-600 ${
        compact ? "w-14 px-1.5 py-0.5 text-xs" : "w-16 px-2 py-1 text-sm"
      }`}
    />
  );

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Stack</span>
        {numberInput}
        <span className="text-xs text-zinc-500 dark:text-zinc-400">bb</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Effective stack</span>
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
      <span className="text-sm text-zinc-500 dark:text-zinc-400">bb</span>
    </div>
  );
}
