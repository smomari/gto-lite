import { STACK_MIN_BB, STACK_MAX_BB } from "@/lib/solveEngine/constants";

interface StackSizeControlProps {
  value: number;
  onChange: (stackBb: number) => void;
}

export function StackSizeControl({ value, onChange }: StackSizeControlProps) {
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
        className="w-16 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-600"
      />
      <span className="text-sm text-zinc-500 dark:text-zinc-400">bb</span>
    </div>
  );
}
