const SUIT_SYMBOLS: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

const SUIT_COLORS: Record<string, string> = {
  s: "text-[#d5d8dc]",
  h: "text-[#e27d7d]",
  d: "text-[#7fa6e0]",
  c: "text-[#7cc49b]",
};

const SIZE_CLASSES = {
  sm: "h-9 w-7 text-xs gap-0",
  md: "h-11 w-9 text-sm gap-0.5",
  /** `sm` on a desktop; on a small screen it fills its grid cell, so all 13 ranks fit the width. */
  fluid: "h-9 w-7 text-xs gap-0 max-lg:aspect-[7/9] max-lg:h-auto max-lg:w-full",
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
        className={`flex flex-col items-center justify-center rounded border border-dashed border-line-strong ${sizeClasses}`}
      />
    );
  }

  const rank = card[0];
  const suit = card[1];
  const symbol = SUIT_SYMBOLS[suit] ?? suit;
  const colorClasses = `bg-raised ring-1 ring-inset ring-line-strong ${SUIT_COLORS[suit] ?? "text-ink"}`;

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
