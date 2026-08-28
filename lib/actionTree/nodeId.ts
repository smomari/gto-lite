import type { ActionNode } from "@/types/rangeData";

/**
 * Serializes an action path into a stable node id, e.g.
 * [] -> "rfi", [{actor:"CO",label:"open"},{actor:"BTN",label:"3bet"}] -> "CO-open_BTN-3bet".
 * The same shape naturally covers squeeze spots (path just keeps accumulating actors).
 */
export function buildNodeId(actionPath: ActionNode[]): string {
  if (actionPath.length === 0) return "rfi";
  return actionPath.map((n) => `${n.actor}-${n.label}`).join("_");
}
