import type { ActionType, Position } from "@/types/rangeData";
import type { SerializedDecisionAction } from "@/types/postflopSolver";
import { STACK_MAX_BB, STACK_MIN_BB } from "@/lib/solveEngine/constants";
import { TOURNAMENT_8, gameFormatById, type GameFormat } from "@/lib/solveEngine/gameFormat";
import { CHIP_EV, icmById, type IcmStructure } from "@/lib/solveEngine/icm";
import { DEFAULT_RAKE_SETTINGS, rakeById, type RakeSettings } from "@/lib/solveEngine/rake";
import { replayActionPath } from "@/lib/solveEngine/replay";

/** The table a hand is played at. */
export interface SpotSettings {
  stackBb: number;
  format: GameFormat;
  rake: RakeSettings;
  icm: IcmStructure;
}

export interface PreflopStep {
  actor: Position;
  action: ActionType;
}

/**
 * The board dealt so far and each street's actions as tokens (see
 * actionToken), flop first. A link writes them as "x-b2.5-c/x-x": streets
 * apart by "/", actions by "-", since a size has its own decimal point.
 */
export interface PostflopLine {
  board: string[];
  streets: string[][];
}

/** Everything a link has to carry to show the same spot again. */
export interface Spot {
  settings: SpotSettings;
  path: PreflopStep[];
  postflop: PostflopLine;
}

export const DEFAULT_SETTINGS: SpotSettings = { stackBb: 100, format: TOURNAMENT_8, rake: DEFAULT_RAKE_SETTINGS, icm: CHIP_EV };
export const EMPTY_LINE: PostflopLine = { board: [], streets: [] };

const PREFLOP_LETTERS: Record<ActionType, string> = { fold: "f", call: "c", raise: "r", allin: "a" };
const PREFLOP_ACTIONS = Object.fromEntries(Object.entries(PREFLOP_LETTERS).map(([action, letter]) => [letter, action])) as Record<string, ActionType>;
const CARD = /^[AKQJT2-9][shdc]$/;
const TOKEN = /^(x|f|c|a|[br]\d+(\.\d+)?)$/;
/** Bet and raise labels carry one decimal, so a token and an action half a step apart are the same size. */
const SIZE_TOLERANCE_BB = 0.06;
/** The keys a link uses. A page address with none of them isn't a shared spot. */
const KEYS = ["f", "s", "rk", "nfnd", "icm", "p", "b", "l"] as const;

/**
 * A postflop action as a link writes it: x check, f fold, c call, a all-in,
 * and a bet or raise with what it puts in ("b2.5", "r7.5"). By size rather
 * than position in the menu, so a link made before the bet sizes changed
 * never points at a different action.
 */
export function actionToken({ action, label }: Pick<SerializedDecisionAction, "action" | "label">): string {
  if (action === "check") return "x";
  if (action === "fold" || action === "call" || action === "allin") return action[0];
  const size = Number(/([\d.]+)bb/.exec(label)?.[1] ?? 0);
  return `${action[0]}${size}`;
}

/** The action at a node that `token` names, if the node still offers it. */
export function findActionByToken<A extends Pick<SerializedDecisionAction, "action" | "label">>(actions: A[], token: string): A | undefined {
  const sized = /^[br]/.test(token);
  return actions.find((candidate) => {
    const own = actionToken(candidate);
    if (!sized) return own === token;
    return own[0] === token[0] && Math.abs(Number(own.slice(1)) - Number(token.slice(1))) < SIZE_TOLERANCE_BB;
  });
}

function sameSettings(a: SpotSettings, b: SpotSettings): boolean {
  return (
    a.stackBb === b.stackBb &&
    a.format.id === b.format.id &&
    a.icm.id === b.icm.id &&
    a.rake.structure.id === b.rake.structure.id &&
    a.rake.noFlopNoDrop === b.rake.noFlopNoDrop
  );
}

/**
 * The query string for a spot, without the "?". The untouched default table
 * with no action is the empty string, so the plain address stays plain. Rake
 * and ICM are written only for a format they apply to.
 */
export function encodeSpot({ settings, path, postflop }: Spot): string {
  const params = new URLSearchParams();
  const defaults = DEFAULT_SETTINGS;
  const relevant: SpotSettings = {
    ...settings,
    rake: settings.format.allowsRake ? settings.rake : defaults.rake,
    icm: settings.format.allowsIcm ? settings.icm : defaults.icm,
  };
  if (path.length === 0 && postflop.board.length === 0 && sameSettings(relevant, defaults)) return "";

  if (relevant.format.id !== defaults.format.id) params.set("f", relevant.format.id);
  if (relevant.stackBb !== defaults.stackBb) params.set("s", String(relevant.stackBb));
  if (relevant.rake.structure.id !== defaults.rake.structure.id) params.set("rk", relevant.rake.structure.id);
  if (!relevant.rake.noFlopNoDrop) params.set("nfnd", "0");
  if (relevant.icm.id !== defaults.icm.id) params.set("icm", relevant.icm.id);
  if (path.length > 0) params.set("p", path.map((step) => PREFLOP_LETTERS[step.action]).join(""));
  if (postflop.board.length > 0) {
    params.set("b", postflop.board.join(""));
    if (postflop.streets.some((street) => street.length > 0)) params.set("l", postflop.streets.map((street) => street.join("-")).join("/"));
  }
  // Card and action tokens are URL-safe as they are; keep the separators readable.
  return params.toString().replaceAll("%2F", "/");
}

/** `search` with its spot replaced by `spotQuery` (from encodeSpot). Whatever else it carries, a campaign tag say, stays. */
export function withSpot(search: string, spotQuery: string): string {
  const others = new URLSearchParams(search);
  for (const key of KEYS) others.delete(key);
  return [others.toString(), spotQuery].filter(Boolean).join("&");
}

/** Whether an address carries a shared spot at all. */
export function hasSpot(search: string): boolean {
  const params = new URLSearchParams(search);
  return KEYS.some((key) => params.has(key));
}

/** A stack the table supports, or the default one. */
export function validStackBb(stack: number): number {
  return Number.isInteger(stack) && stack >= STACK_MIN_BB && stack <= STACK_MAX_BB ? stack : DEFAULT_SETTINGS.stackBb;
}

function decodePath(letters: string, stackBb: number, format: GameFormat): PreflopStep[] {
  const path: PreflopStep[] = [];
  for (const letter of letters) {
    const action = PREFLOP_ACTIONS[letter];
    const replayed = replayActionPath(path, stackBb, format);
    if (!action || replayed.status !== "active") break;
    const next = [...path, { actor: replayed.activeSeat, action }];
    if (replayActionPath(next, stackBb, format).status === "invalid") break;
    path.push(next[next.length - 1]);
  }
  return path;
}

function decodeBoard(text: string): string[] {
  const cards = text.match(/.{2}/g) ?? [];
  const valid: string[] = [];
  for (const card of cards.slice(0, 5)) {
    if (!CARD.test(card) || valid.includes(card)) break;
    valid.push(card);
  }
  // A flop is three cards or none.
  return valid.length < 3 ? [] : valid;
}

/**
 * The spot a query string describes. Whatever a link leaves out is the
 * default, so the same link shows everyone the same spot; `fallback` only
 * supplies the rake and ICM of formats the link's own doesn't use. Anything
 * unreadable is dropped along with what followed it: an unknown format is the
 * default one, a preflop line stops at its first illegal action.
 */
export function decodeSpot(search: string, fallback: SpotSettings = DEFAULT_SETTINGS): Spot {
  const params = new URLSearchParams(search);
  const format = gameFormatById(params.get("f") ?? "") ?? DEFAULT_SETTINGS.format;
  const stackBb = validStackBb(Number(params.get("s") ?? DEFAULT_SETTINGS.stackBb));
  const rake: RakeSettings = format.allowsRake
    ? { structure: rakeById(params.get("rk") ?? "") ?? DEFAULT_SETTINGS.rake.structure, noFlopNoDrop: params.get("nfnd") !== "0" }
    : fallback.rake;
  const icm = format.allowsIcm ? (icmById(params.get("icm") ?? "") ?? DEFAULT_SETTINGS.icm) : fallback.icm;

  const path = decodePath(params.get("p") ?? "", stackBb, format);
  // A board only means something once the preflop action has closed.
  const board = replayActionPath(path, stackBb, format).status === "resolved" ? decodeBoard(params.get("b") ?? "") : [];
  const streets: string[][] = [];
  if (board.length > 0) {
    for (const street of (params.get("l") ?? "").split("/").slice(0, board.length - 2)) {
      const tokens = street.split("-").filter(Boolean);
      const firstBad = tokens.findIndex((token) => !TOKEN.test(token));
      streets.push(firstBad < 0 ? tokens : tokens.slice(0, firstBad));
      if (firstBad >= 0) break;
    }
  }
  return { settings: { stackBb, format, rake, icm }, path, postflop: { board, streets } };
}
