import type { ActionType, Position } from "@/types/rangeData";
import type { SolveErrorBody, SolveRequest, SolveResponse } from "@/types/solveApi";
import { SEAT_ORDER } from "@/lib/actionTree/seatOrder";
import { buildNodeId } from "@/lib/actionTree/nodeId";
import { STACK_MIN_BB, STACK_MAX_BB } from "@/lib/solveEngine/constants";
import { replayActionPath } from "@/lib/solveEngine/replay";
import { computeAvailableActions } from "@/lib/solveEngine/actionSizing";
import { solveActiveSeat } from "@/lib/solveEngine/solve";
import { loadEquityMatrix } from "@/lib/equity/loadEquityMatrix";

// No `export const runtime = "edge"` here — loadEquityMatrix uses fs.readFileSync
// and must run on the Node.js runtime.

const VERSION = "1.0.0";
const VALID_ACTIONS: ActionType[] = ["fold", "call", "raise", "allin"];

function errorResponse(status: number, body: SolveErrorBody): Response {
  return Response.json(body, { status });
}

type ValidationResult =
  | { ok: true; value: SolveRequest }
  | { ok: false; error: SolveErrorBody };

function validateRequest(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: { error: "Request body must be an object", code: "INVALID_ACTION_PATH" } };
  }
  const b = body as Record<string, unknown>;

  const stack = b.effectiveStackBb;
  if (
    typeof stack !== "number" ||
    !Number.isInteger(stack) ||
    stack < STACK_MIN_BB ||
    stack > STACK_MAX_BB
  ) {
    return {
      ok: false,
      error: {
        error: `effectiveStackBb must be an integer between ${STACK_MIN_BB} and ${STACK_MAX_BB}`,
        code: "INVALID_STACK",
      },
    };
  }

  const path = b.actionPath;
  if (!Array.isArray(path)) {
    return { ok: false, error: { error: "actionPath must be an array", code: "INVALID_ACTION_PATH" } };
  }

  const cleaned: Pick<{ actor: Position; action: ActionType }, "actor" | "action">[] = [];
  for (const node of path) {
    if (typeof node !== "object" || node === null) {
      return { ok: false, error: { error: "Each actionPath entry must be an object", code: "INVALID_ACTION_PATH" } };
    }
    const actor = (node as Record<string, unknown>).actor;
    const action = (node as Record<string, unknown>).action;
    if (typeof actor !== "string" || !SEAT_ORDER.includes(actor as Position)) {
      return { ok: false, error: { error: `Invalid actor: ${String(actor)}`, code: "INVALID_ACTION_PATH" } };
    }
    if (typeof action !== "string" || !VALID_ACTIONS.includes(action as ActionType)) {
      return { ok: false, error: { error: `Invalid action: ${String(action)}`, code: "INVALID_ACTION_PATH" } };
    }
    cleaned.push({ actor: actor as Position, action: action as ActionType });
  }

  return { ok: true, value: { effectiveStackBb: stack, actionPath: cleaned } };
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, { error: "Request body must be valid JSON", code: "INVALID_ACTION_PATH" });
  }

  const validated = validateRequest(body);
  if (!validated.ok) return errorResponse(400, validated.error);

  const { effectiveStackBb, actionPath } = validated.value;
  const replayResult = replayActionPath(actionPath, effectiveStackBb);

  if (replayResult.status === "invalid") {
    return errorResponse(400, { error: replayResult.reason, code: "INVALID_ACTION_PATH" });
  }
  if (replayResult.status === "resolved") {
    return errorResponse(400, {
      error: `Hand already resolved (${replayResult.reason})`,
      code: "HAND_RESOLVED",
      reason: replayResult.reason,
      actionPath: replayResult.canonicalActionPath,
      potBb: replayResult.potState.potBb,
    });
  }

  try {
    const matrix = loadEquityMatrix();
    const { activeSeat, potState, canonicalActionPath } = replayResult;
    const availableActions = computeAvailableActions(activeSeat, potState, effectiveStackBb);
    const { hands, source } = solveActiveSeat(matrix, activeSeat, potState, effectiveStackBb);

    const response: SolveResponse = {
      heroPosition: activeSeat,
      stackDepth: effectiveStackBb,
      nodeId: buildNodeId(canonicalActionPath),
      actionPath: canonicalActionPath,
      source,
      generatedAt: new Date().toISOString(),
      version: VERSION,
      hands,
      potBb: potState.potBb,
      currentBetToCall: potState.currentBetToCall,
      availableActions,
    };
    return Response.json(response, { status: 200 });
  } catch (err) {
    return errorResponse(500, { error: err instanceof Error ? err.message : String(err), code: "INTERNAL" });
  }
}
