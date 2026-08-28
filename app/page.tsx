"use client";

import { useEffect, useMemo, useState } from "react";
import { PositionSelector } from "@/components/PositionSelector";
import { StackDepthSelector } from "@/components/StackDepthSelector";
import { ActionTreeNav } from "@/components/ActionTreeNav";
import { SourceBadge } from "@/components/SourceBadge";
import { RangeGrid } from "@/components/RangeGrid/RangeGrid";
import { loadManifest, loadScenario } from "@/lib/dataLoader/loadScenario";
import type { ManifestNode, Position, RangeManifest, RangeScenario } from "@/types/rangeData";

const POSITIONS: Position[] = ["UTG", "MP", "CO", "BTN", "SB", "BB"];

function getRoots(nodes: ManifestNode[]): ManifestNode[] {
  const ids = new Set(nodes.map((n) => n.nodeId));
  return nodes.filter((n) => n.parentNodeId === null || !ids.has(n.parentNodeId));
}

export default function Home() {
  const [manifest, setManifest] = useState<RangeManifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);

  const [position, setPosition] = useState<Position>("BTN");
  const [stackDepth, setStackDepth] = useState<number>(100);
  const [nodeId, setNodeId] = useState<string | null>(null);

  const [scenario, setScenario] = useState<RangeScenario | null>(null);
  const [scenarioError, setScenarioError] = useState<string | null>(null);

  useEffect(() => {
    loadManifest()
      .then(setManifest)
      .catch((err) => setManifestError(String(err)));
  }, []);

  const stackDepths = useMemo(() => {
    if (!manifest) return [20, 40, 100];
    return [...new Set(manifest.entries.map((e) => e.stackDepth))].sort((a, b) => a - b);
  }, [manifest]);

  const currentEntry = useMemo(() => {
    return manifest?.entries.find((e) => e.heroPosition === position && e.stackDepth === stackDepth);
  }, [manifest, position, stackDepth]);

  const resolvedNodeId = useMemo(() => {
    if (!currentEntry) return null;
    if (nodeId && currentEntry.nodes.some((n) => n.nodeId === nodeId)) return nodeId;
    const rfi = currentEntry.nodes.find((n) => n.nodeId === "rfi");
    if (rfi) return rfi.nodeId;
    const roots = getRoots(currentEntry.nodes);
    return roots[0]?.nodeId ?? null;
  }, [currentEntry, nodeId]);

  function handlePositionChange(next: Position) {
    setPosition(next);
    setNodeId(null);
  }

  function handleStackDepthChange(next: number) {
    setStackDepth(next);
    setNodeId(null);
  }

  useEffect(() => {
    if (!currentEntry || !resolvedNodeId) return;
    const node = currentEntry.nodes.find((n) => n.nodeId === resolvedNodeId);
    if (!node) return;

    let cancelled = false;
    loadScenario(node.filePath)
      .then((s) => {
        if (!cancelled) setScenario(s);
      })
      .catch((err) => {
        if (!cancelled) setScenarioError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [currentEntry, resolvedNodeId]);

  // Only render `scenario` once it actually matches the current selection —
  // avoids a setState-in-effect just to null it out while a new fetch is in flight.
  const displayedScenario =
    scenario &&
    scenario.heroPosition === position &&
    scenario.stackDepth === stackDepth &&
    scenario.nodeId === resolvedNodeId
      ? scenario
      : null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          GTO Lite — Preflop Range Viewer
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Tournament preflop ranges by position, stack depth, and action sequence.
        </p>
      </header>

      {manifestError && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Failed to load range data: {manifestError}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <PositionSelector positions={POSITIONS} value={position} onChange={handlePositionChange} />
        <StackDepthSelector
          stackDepths={stackDepths}
          value={stackDepth}
          onChange={handleStackDepthChange}
        />
      </section>

      {currentEntry ? (
        <ActionTreeNav
          nodes={currentEntry.nodes}
          currentNodeId={resolvedNodeId}
          onNavigate={setNodeId}
        />
      ) : (
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          No data generated for {position} at {stackDepth}bb yet.
        </p>
      )}

      {scenarioError && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Failed to load scenario: {scenarioError}
        </p>
      )}

      {displayedScenario ? (
        <section className="flex flex-col gap-3">
          <SourceBadge source={displayedScenario.source} />
          <RangeGrid scenario={displayedScenario} />
        </section>
      ) : (
        !manifestError && <p className="text-sm text-zinc-400 dark:text-zinc-500">Loading...</p>
      )}
    </div>
  );
}
