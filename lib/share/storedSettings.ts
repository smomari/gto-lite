import { gameFormatById } from "@/lib/solveEngine/gameFormat";
import { icmById } from "@/lib/solveEngine/icm";
import { rakeById } from "@/lib/solveEngine/rake";
import { DEFAULT_SETTINGS, EMPTY_LINE, decodeSpot, hasSpot, validStackBb, type Spot, type SpotSettings } from "./spotLink";

const STORAGE_KEY = "gtoLite.settings";

/** The table last used in this browser, or the default one. Private modes may refuse storage. */
export function readStoredSettings(): SpotSettings {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Record<string, unknown> | null;
    if (!stored) return DEFAULT_SETTINGS;
    return {
      stackBb: validStackBb(Number(stored.stackBb)),
      format: gameFormatById(String(stored.format)) ?? DEFAULT_SETTINGS.format,
      rake: {
        structure: rakeById(String(stored.rake)) ?? DEFAULT_SETTINGS.rake.structure,
        noFlopNoDrop: stored.noFlopNoDrop !== false,
      },
      icm: icmById(String(stored.icm)) ?? DEFAULT_SETTINGS.icm,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function storeSettings({ stackBb, format, rake, icm }: SpotSettings) {
  try {
    const stored = { stackBb, format: format.id, rake: rake.structure.id, noFlopNoDrop: rake.noFlopNoDrop, icm: icm.id };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // The choice then lasts until reload.
  }
}

/** Where a visit starts: the spot in the address if it carries one, else an empty hand at the table last used here. */
export function initialSpot(search: string): Spot {
  const stored = readStoredSettings();
  return hasSpot(search) ? decodeSpot(search, stored) : { settings: stored, path: [], postflop: EMPTY_LINE };
}
