export type RakeId = "none" | "online-high" | "online-mid" | "online-std" | "online-low" | "live";

/** What the house takes: `rate` of the pot, up to `capBb`. */
export interface RakeTerms {
  rate: number;
  capBb: number;
}

export interface RakeStructure extends RakeTerms {
  id: RakeId;
  label: string;
  /** Where this structure is typical. Representative figures, not any one room's. */
  stakes: string;
}

export interface RakeSettings {
  structure: RakeStructure;
  /** Rake only the pots that see a flop. */
  noFlopNoDrop: boolean;
}

/** A pot that checks down, takes one bet, takes two, and gets the stacks in: the cap only bites on the last ones. */
const TYPICAL_POTS_BB = [5.5, 20, 60, 200];

export const NO_RAKE: RakeStructure = { id: "none", label: "No rake", rate: 0, capBb: 0, stakes: "" };
const ONLINE_LOW: RakeStructure = { id: "online-low", label: "Online low", rate: 0.05, capBb: 5, stakes: "NL10~25" };

export const RAKE_PRESETS: RakeStructure[] = [
  NO_RAKE,
  { id: "online-high", label: "Online high", rate: 0.05, capBb: 1, stakes: "NL500+" },
  { id: "online-mid", label: "Online mid", rate: 0.05, capBb: 2.5, stakes: "NL200" },
  { id: "online-std", label: "Online std", rate: 0.05, capBb: 3, stakes: "NL50~100 · GG" },
  ONLINE_LOW,
  { id: "live", label: "Live", rate: 0.1, capBb: 3, stakes: "라이브 1/2~1/3" },
];

export const DEFAULT_RAKE_SETTINGS: RakeSettings = { structure: ONLINE_LOW, noFlopNoDrop: true };
export const NO_RAKE_SETTINGS: RakeSettings = { structure: NO_RAKE, noFlopNoDrop: true };

export function rakeById(id: string): RakeStructure | undefined {
  return RAKE_PRESETS.find((rake) => rake.id === id);
}

export function rakeForPot(potBb: number, rake: RakeTerms): number {
  return Math.min(potBb * rake.rate, rake.capBb);
}

/** What the winner actually collects. */
export function netPot(potBb: number, rake: RakeTerms): number {
  return potBb - rakeForPot(potBb, rake);
}

/** The share of a typical pot this rake takes. */
export function rakeShare(rake: RakeTerms): number {
  return TYPICAL_POTS_BB.reduce((sum, pot) => sum + rakeForPot(pot, rake) / pot, 0) / TYPICAL_POTS_BB.length;
}

/** "5%/3bb", or the label when there is no rake to state. */
export function rakeSummary(rake: RakeStructure): string {
  return rake.rate === 0 ? rake.label : `${Math.round(rake.rate * 100)}%/${rake.capBb}bb`;
}
