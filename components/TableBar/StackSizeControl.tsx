import { STACK_MIN_BB, STACK_MAX_BB } from "@/lib/solveEngine/constants";

interface StackSizeControlProps {
  value: number;
  onChange: (stackBb: number) => void;
}

export function StackSizeControl({ value, onChange }: StackSizeControlProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="basis-full text-sm font-medium text-ink-muted">Effective stack</span>
      <input
        type="range"
        aria-label="Effective stack"
        min={STACK_MIN_BB}
        max={STACK_MAX_BB}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 flex-1 accent-accent"
      />
      <input
        type="number"
        aria-label="Effective stack"
        min={STACK_MIN_BB}
        max={STACK_MAX_BB}
        step={1}
        value={value}
        onChange={(e) => {
          const next = Math.min(STACK_MAX_BB, Math.max(STACK_MIN_BB, Number(e.target.value) || STACK_MIN_BB));
          onChange(next);
        }}
        className="w-20 rounded border border-line-strong bg-transparent px-2 py-1 font-mono text-[16px] tabular-nums text-ink"
      />
      <span className="text-sm text-ink-muted">bb</span>
    </div>
  );
}
