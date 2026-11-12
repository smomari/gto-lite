import { ACTION_COLORS } from "@/components/RangeGrid/colorLegend";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/siteUrl";

/**
 * Artwork for the link preview and the home-screen icon, drawn with next/og:
 * every element is a flex box with inline styles, which is all it renders.
 */
const CANVAS = "#0b0d10";
const INK = "#e8eaed";
const INK_MUTED = "#8b919a";
const ACCENT = "#4fb98e";
const RANKS = 13;

/** An opening range's rough shape on the 13×13 grid (row and column 0 = ace): pairs on the diagonal, suited above it. */
function cellColor(row: number, col: number): string {
  const sum = row + col;
  if (row === col) return row <= 8 ? ACTION_COLORS.raise : ACTION_COLORS.call;
  if (col > row) {
    if (row === 0 || sum <= 9) return ACTION_COLORS.raise;
    return col - row <= 2 && sum <= 15 ? ACTION_COLORS.call : ACTION_COLORS.fold;
  }
  return sum <= 6 ? ACTION_COLORS.raise : ACTION_COLORS.fold;
}

function RangeGridArt({ cell, gap }: { cell: number; gap: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: RANKS }, (_, row) => (
        <div key={row} style={{ display: "flex", gap }}>
          {Array.from({ length: RANKS }, (_, col) => (
            <div key={col} style={{ width: cell, height: cell, borderRadius: cell / 7, background: cellColor(row, col) }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** The 1200×630 link preview: the name and what it does beside a range grid. */
export function SharePreviewArt() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 72px",
        background: CANVAS,
        color: INK,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", width: 500 }}>
        <div style={{ display: "flex", fontSize: 92, fontWeight: 700, letterSpacing: -3 }}>{SITE_NAME}</div>
        <div style={{ display: "flex", marginTop: 12, fontSize: 38, lineHeight: 1.25, color: INK }}>{SITE_TAGLINE}</div>
        <div style={{ display: "flex", marginTop: 36, fontSize: 26, color: INK_MUTED }}>Tournament · Cash · ICM · Postflop</div>
        <div style={{ display: "flex", marginTop: 14, fontSize: 26, color: ACCENT }}>Free · No sign-up</div>
      </div>
      <RangeGridArt cell={34} gap={4} />
    </div>
  );
}

/** The square icon: the top-left corner of the grid. */
export function AppIconArt({ size }: { size: number }) {
  const gap = size / 30;
  const cell = (size * 0.72 - gap * 3) / 4;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: CANVAS }}>
      <div style={{ display: "flex", flexDirection: "column", gap }}>
        {Array.from({ length: 4 }, (_, row) => (
          <div key={row} style={{ display: "flex", gap }}>
            {Array.from({ length: 4 }, (_, col) => (
              <div
                key={col}
                style={{ width: cell, height: cell, borderRadius: cell / 6, background: cellColor(row * 3, col * 3) }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
