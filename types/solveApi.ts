import type { ActionNode, ActionType, Position, RangeScenario } from "./rangeData";

export interface SolveRequest {
  effectiveStackBb: number;
  actionPath: Pick<ActionNode, "actor" | "action">[];
}

export interface CallOption {
  label: "Call" | "Check";
  amountBb: number;
}

export interface RaiseOption {
  toBb: number;
}

export interface AllinOption {
  toBb: number;
}

export interface AvailableActions {
  fold: true;
  call: CallOption | null;
  raise: RaiseOption | null;
  allin: AllinOption;
}

export interface SolveResponse extends RangeScenario {
  potBb: number;
  currentBetToCall: number;
  availableActions: AvailableActions;
}

export type SolveErrorCode = "INVALID_STACK" | "INVALID_ACTION_PATH" | "HAND_RESOLVED" | "INTERNAL";
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
