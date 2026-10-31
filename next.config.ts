import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cross-origin isolation unlocks SharedArrayBuffer, which the postflop solver
  // needs to run its threaded WASM build (lib/postflopSolver/wasm/loadWeb.ts);
  // without it, solves fall back to one thread. Every resource the page
  // loads must then be same-origin or opt in via CORP — true today: fonts are
  // self-hosted by next/font and nothing else is loaded cross-origin.
  headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
