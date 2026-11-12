import type { ActionType, Position } from "@/types/rangeData";
import type { SolveErrorBody, SolveRequest, SolveResponse } from "@/types/solveApi";
import { SEAT_ORDER } from "@/lib/actionTree/seatOrder";
import { buildNodeId } from "@/lib/actionTree/nodeId";
import { STACK_MIN_BB, STACK_MAX_BB } from "@/lib/solveEngine/constants";
import { TOURNAMENT_8, gameFormatById, type GameFormat } from "@/lib/solveEngine/gameFormat";
import { NO_RAKE, rakeById, type RakeSettings } from "@/lib/solveEngine/rake";
import { CHIP_EV, icmById, isChipEv, type IcmStructure } from "@/lib/solveEngine/icm";
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
  | { ok: true; value: Pick<SolveRequest, "effectiveStackBb" | "actionPath"> & { format: GameFormat; rake: RakeSettings; icm: IcmStructure } }
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

  const format = b.format === undefined ? TOURNAMENT_8 : gameFormatById(String(b.format));
  if (!format) {
    return { ok: false, error: { error: `Unknown format: ${String(b.format)}`, code: "INVALID_FORMAT" } };
  }

  const structure = b.rake === undefined ? NO_RAKE : rakeById(String(b.rake));
  if (!structure) {
    return { ok: false, error: { error: `Unknown rake: ${String(b.rake)}`, code: "INVALID_RAKE" } };
  }
  const noFlopNoDrop = b.noFlopNoDrop ?? true;
  if (typeof noFlopNoDrop !== "boolean") {
    return { ok: false, error: { error: "noFlopNoDrop must be a boolean", code: "INVALID_RAKE" } };
  }
  const rake = { structure: format.allowsRake ? structure : NO_RAKE, noFlopNoDrop };

  const icm = b.icm === undefined ? CHIP_EV : icmById(String(b.icm));
  if (!icm) {
    return { ok: false, error: { error: `Unknown icm: ${String(b.icm)}`, code: "INVALID_ICM" } };
  }

  return { ok: true, value: { effectiveStackBb: stack, actionPath: cleaned, format, rake, icm: format.allowsIcm ? icm : CHIP_EV } };
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

  const { effectiveStackBb, actionPath, format, rake, icm } = validated.value;
  const replayResult = replayActionPath(actionPath, effectiveStackBb, format);

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
      committed: replayResult.potState.committed,
    });
  }

  try {
    const matrix = loadEquityMatrix();
    const { activeSeat, potState, canonicalActionPath } = replayResult;
    const availableActions = computeAvailableActions(activeSeat, potState, effectiveStackBb);
    const { hands, source } = solveActiveSeat(matrix, activeSeat, potState, effectiveStackBb, rake, icm);

    const response: SolveResponse = {
      heroPosition: activeSeat,
      stackDepth: effectiveStackBb,
      nodeId: buildNodeId(canonicalActionPath),
      actionPath: canonicalActionPath,
      source,
      ...(isChipEv(icm) ? {} : { icm: icm.id }),
      generatedAt: new Date().toISOString(),
      version: VERSION,
      hands,
      potBb: potState.potBb,
      currentBetToCall: potState.currentBetToCall,
      availableActions,
    };
    return Response.json(response, { status: 200 });
  } catch (err) {
    // The cause stays in the logs: an engine error's text is no use to a visitor and says too much about the server.
    console.error("solve failed", err);
    return errorResponse(500, { error: "The solve failed on the server", code: "INTERNAL" });
  }
}
