export type Position = "UTG" | "MP" | "CO" | "BTN" | "SB" | "BB";
export type StackDepth = number;

export type ActionType = "fold" | "call" | "raise" | "allin";

export interface ActionNode {
  actor: Position;
  action: ActionType;
  label: string;
  sizeBb?: number;
}

export interface HandFrequency {
  hand: string;
  fold: number;
  call: number;
  raise: number;
  allin?: number;
  raiseSize?: string;
}

export type RangeSource = "nash-shove-fold" | "heuristic-approx" | "solver-export";

export interface RangeScenario {
  heroPosition: Position;
  stackDepth: StackDepth;
  nodeId: string;
  actionPath: ActionNode[];
  source: RangeSource;
  generatedAt: string;
  version: string;
  hands: HandFrequency[];
}

export interface ManifestNode {
  nodeId: string;
  label: string;
  parentNodeId: string | null;
  source: RangeSource;
  filePath: string;
}

export interface ManifestEntry {
  heroPosition: Position;
  stackDepth: StackDepth;
  nodes: ManifestNode[];
}

export interface RangeManifest {
  entries: ManifestEntry[];
}
