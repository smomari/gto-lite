import type { ActionNode, ActionType, RangeScenario } from "./rangeData";

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
}

export type { ActionType };
