const SUIT_SYMBOLS: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

/** Club deliberately uses `green-*`, not `emerald-*` — this app already uses emerald to mean "selected/confirm" (see BoardPicker's selection ring, confirm buttons), so reusing it for a suit color would make "selected" and "clubs" visually ambiguous. */
const SUIT_COLORS: Record<string, string> = {
  s: "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-50",
  h: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  d: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  c: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

const SIZE_CLASSES = {
  sm: "h-9 w-7 text-xs gap-0",
  md: "h-11 w-9 text-sm gap-0.5",
} as const;

interface CardChipProps {
  /** e.g. "Kh". Omit to render an empty placeholder slot (a not-yet-picked card). */
  card?: string;
  size?: keyof typeof SIZE_CLASSES;
}

/**
 * Presentational only — decorative (aria-hidden). Interactive card buttons
 * (BoardPicker) keep the accessible name on the wrapping <button> via
 * aria-label so screen readers and existing `getByRole("button", { name:
 * "As" })`-style test queries are unaffected by this component's markup.
 */
export function CardChip({ card, size = "sm" }: CardChipProps) {
  const sizeClasses = SIZE_CLASSES[size];

  if (!card) {
    return (
      <div
        aria-hidden
        className={`flex flex-col items-center justify-center rounded border border-dashed border-zinc-300 dark:border-zinc-700 ${sizeClasses}`}
      />
    );
  }

  const rank = card[0];
  const suit = card[1];
  const symbol = SUIT_SYMBOLS[suit] ?? suit;
  const colorClasses = SUIT_COLORS[suit] ?? "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-50";

  return (
    <div
      aria-hidden
      title={card}
      data-card={card}
      className={`flex flex-col items-center justify-center rounded font-semibold leading-none ${colorClasses} ${sizeClasses}`}
    >
      <span>{rank}</span>
      <span>{symbol}</span>
    </div>
  );
}
