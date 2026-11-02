import type { GameFormatId } from "@/lib/solveEngine/gameFormat";
import type { RakeId } from "@/lib/solveEngine/rake";
import type { ActionNode, ActionType, Position, RangeScenario } from "./rangeData";

export interface SolveRequest {
  effectiveStackBb: number;
  actionPath: Pick<ActionNode, "actor" | "action">[];
  /** Defaults to the tournament format. */
  format?: GameFormatId;
  /** Ignored by formats without rake. Defaults to no rake. */
  rake?: RakeId;
  /** Defaults to true. */
  noFlopNoDrop?: boolean;
}

export interface CallOption {
  label: "Call" | "Check" | "Limp";
  amountBb: number;
}

export interface RaiseOption {
  toBb: number;
}

export interface AllinOption {
  toBb: number;
}

export interface AvailableActions {
  /** False only when checking is free: nothing to fold to. */
  fold: boolean;
  call: CallOption | null;
  raise: RaiseOption | null;
  /** Null when facing an all-in: there's nothing left to raise, so Call already puts the whole stack in. */
  allin: AllinOption | null;
}

export interface SolveResponse extends RangeScenario {
  potBb: number;
  currentBetToCall: number;
  availableActions: AvailableActions;
}

export type SolveErrorCode = "INVALID_STACK" | "INVALID_ACTION_PATH" | "INVALID_FORMAT" | "INVALID_RAKE" | "HAND_RESOLVED" | "INTERNAL";
export type HandResolvedReason = "uncontested" | "action-closed";

export interface SolveErrorBody {
  error: string;
  code: SolveErrorCode;
  reason?: HandResolvedReason;
  /** Present only when code === "HAND_RESOLVED": the server-canonical path that led to resolution. */
  actionPath?: ActionNode[];
  /** Present only when code === "HAND_RESOLVED": final pot size. */
  potBb?: number;
  /**
   * Present only when code === "HAND_RESOLVED": chips each live seat had
   * committed at resolution — lets a client derive each seat's remaining
   * stack (effectiveStackBb - committed[seat]) for a postflop hand-off.
   */
  committed?: Partial<Record<Position, number>>;
}

export type { ActionType };
