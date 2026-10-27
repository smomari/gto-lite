/** 0.123 -> "12.3%" */
export function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

/** 0.75 -> "+0.75bb", -0.75 -> "-0.75bb", 0 -> "0.00bb" */
export function formatSignedBb(bb: number): string {
  return `${bb > 0 ? "+" : ""}${bb.toFixed(2)}bb`;
}
