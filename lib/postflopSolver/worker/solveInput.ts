import type { ActionWeightKey, PostflopSolveRequest } from "@/types/postflopSolver";
import type { HandFrequency } from "@/types/rangeData";
import type { PostflopSolveInput } from "../solvePostflop";

function actionWeight(key: ActionWeightKey): (hf: HandFrequency) => number {
  return (hf) => hf[key] ?? 0;
}

/** A worker request as solvePostflopStreet's input: a canonical request's action keys become the weight functions that pick its ranges. */
export function toSolveInput(request: PostflopSolveRequest): PostflopSolveInput {
  if (request.kind === "combos") return request;
  const { heroActionKey, villainActionKey, ...rest } = request;
  return { ...rest, heroActionWeight: actionWeight(heroActionKey), villainActionWeight: actionWeight(villainActionKey) };
}
