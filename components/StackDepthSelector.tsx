interface StackDepthSelectorProps {
  stackDepths: number[];
  value: number;
  onChange: (stackDepth: number) => void;
}

export function StackDepthSelector({ stackDepths, value, onChange }: StackDepthSelectorProps) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Stack depth">
      {stackDepths.map((depth) => (
        <button
          key={depth}
          type="button"
          onClick={() => onChange(depth)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            depth === value
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          }`}
        >
          {depth}bb
        </button>
      ))}
    </div>
  );
}
