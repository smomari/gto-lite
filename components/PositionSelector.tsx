import type { Position } from "@/types/rangeData";

interface PositionSelectorProps {
  positions: Position[];
  value: Position;
  onChange: (position: Position) => void;
}

export function PositionSelector({ positions, value, onChange }: PositionSelectorProps) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Position">
      {positions.map((pos) => (
        <button
          key={pos}
          type="button"
          onClick={() => onChange(pos)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            pos === value
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          }`}
        >
          {pos}
        </button>
      ))}
    </div>
  );
}
