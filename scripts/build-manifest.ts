import { readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import type { ActionNode, ManifestEntry, ManifestNode, RangeManifest, RangeScenario } from "../types/rangeData";

const RANGES_ROOT = resolve(__dirname, "../public/data/ranges");
const OUTPUT_PATH = resolve(RANGES_ROOT, "manifest.json");

const NODE_LABELS: Record<string, string> = {
  open: "Open",
  "3bet": "3-Bet",
  "4bet": "4-Bet",
  "cold-call": "Cold Call",
};

function deriveLabel(actionPath: ActionNode[]): string {
  if (actionPath.length === 0) return "RFI";
  const last = actionPath[actionPath.length - 1];
  return `vs ${last.actor} ${NODE_LABELS[last.label] ?? last.label}`;
}

function findJsonFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...findJsonFiles(full));
    } else if (entry.endsWith(".json") && entry !== "manifest.json") {
      out.push(full);
    }
  }
  return out;
}

function isProperPrefix(prefix: ActionNode[], path: ActionNode[]): boolean {
  if (prefix.length >= path.length) return false;
  return prefix.every((step, i) => step.actor === path[i].actor && step.label === path[i].label);
}

interface Scenario {
  nodeId: string;
  actionPath: ActionNode[];
  source: RangeScenario["source"];
  filePath: string;
}

/**
 * The naive parent (strip the last action-path step) doesn't always name a
 * node that actually exists: e.g. a vs-3bet node's stripped path is
 * hero's-own-open, but hero's root decision is always named "rfi" regardless
 * of position, so the two never match as strings. Instead, find whichever
 * *other* scenario in the same hero/stack group has the longest actionPath
 * that is a proper prefix of this one — the true nearest ancestor actually
 * present in the generated data. If none exists (including no "rfi" root,
 * e.g. BB never opens), the node is a real root for this group.
 */
function findParent(scenario: Scenario, siblings: Scenario[]): string | null {
  let best: Scenario | null = null;
  for (const candidate of siblings) {
    if (candidate === scenario) continue;
    if (!isProperPrefix(candidate.actionPath, scenario.actionPath)) continue;
    if (!best || candidate.actionPath.length > best.actionPath.length) best = candidate;
  }
  return best?.nodeId ?? null;
}

function main() {
  const files = findJsonFiles(RANGES_ROOT);
  const byGroup = new Map<string, { heroPosition: string; stackDepth: number; scenarios: Scenario[] }>();

  for (const file of files) {
    const scenario: RangeScenario = JSON.parse(readFileSync(file, "utf-8"));
    const groupKey = `${scenario.heroPosition}|${scenario.stackDepth}`;
    if (!byGroup.has(groupKey)) {
      byGroup.set(groupKey, { heroPosition: scenario.heroPosition, stackDepth: scenario.stackDepth, scenarios: [] });
    }
    const filePath = `/data/ranges/${file.slice(RANGES_ROOT.length + 1).split("\\").join("/")}`;
    byGroup.get(groupKey)!.scenarios.push({
      nodeId: scenario.nodeId,
      actionPath: scenario.actionPath,
      source: scenario.source,
      filePath,
    });
  }

  const entries: ManifestEntry[] = [];
  for (const group of byGroup.values()) {
    const nodes: ManifestNode[] = group.scenarios.map((s) => ({
      nodeId: s.nodeId,
      label: deriveLabel(s.actionPath),
      parentNodeId: findParent(s, group.scenarios),
      source: s.source,
      filePath: s.filePath,
    }));
    entries.push({ heroPosition: group.heroPosition as ManifestEntry["heroPosition"], stackDepth: group.stackDepth, nodes });
  }

  const manifest: RangeManifest = { entries };
  writeFileSync(OUTPUT_PATH, JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${OUTPUT_PATH} (${files.length} scenarios, ${manifest.entries.length} groups)`);
}

main();
