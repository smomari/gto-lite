"use client"; // Error boundaries must be Client Components

/**
 * Replaces the root layout when it fails, so it brings its own document and
 * styles: the app's stylesheet and fonts aren't there to lean on, and neither
 * is the language choice.
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          gap: 12,
          padding: "0 16px",
          background: "#0b0d10",
          color: "#e8eaed",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <title>Something went wrong · gtoLite</title>
        <h1 style={{ margin: 0, fontSize: 20 }}>Something went wrong</h1>
        <p style={{ margin: 0, fontSize: 15, color: "#8b919a" }}>The page hit an unexpected error. Trying again usually fixes it.</p>
        <button
          type="button"
          onClick={() => retry()}
          style={{ border: 0, borderRadius: 4, padding: "8px 12px", fontSize: 13, fontWeight: 500, background: "#4fb98e", color: "#0b0d10", cursor: "pointer" }}
        >
          Retry
        </button>
      </body>
    </html>
  );
}
