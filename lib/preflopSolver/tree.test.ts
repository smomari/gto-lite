import { describe, expect, it } from "vitest";
import { gameFormatById, reraiseSizesAt, TOURNAMENT_8 } from "@/lib/solveEngine/gameFormat";
import { BLIND_DEFENSE_RULES, buildPreflopTree, nodeAt, PUSH_FOLD_RULES, type TreeNode } from "./tree";

const blindDefense = (stackBb: number, format = TOURNAMENT_8) =>
  buildPreflopTree({ format, stackBb, seats: ["BTN", "SB", "BB"], rules: BLIND_DEFENSE_RULES });
const actionsAt = (node: TreeNode | undefined) => (node?.kind === "decision" ? node.actions.map((a) => a.action) : []);

describe("buildPreflopTree", () => {
  it("starts at the button with everyone before it folded", () => {
    const tree = blindDefense(100);
    expect(tree.root.kind === "decision" && tree.root.state.foldedSeats.has("CO")).toBe(true);
    expect(actionsAt(tree.root)).toEqual(["raise", "fold"]);
    expect(nodeAt(tree, ["fold"])).toMatchObject({ kind: "terminal", outcome: "abandoned" });
  });

  it("sizes raises as the app does", () => {
    const tree = blindDefense(100);
    const open = tree.root.kind === "decision" ? tree.root.actions[0].toBb! : 0;
    expect(open).toBe(2.5);
    const bb = nodeAt(tree, ["raise", "fold"]);
    expect(bb?.kind === "decision" && bb.actions.find((a) => a.action === "raise")?.toBb).toBe(
      Number((open * reraiseSizesAt(TOURNAMENT_8, 100).threeBet.bbOop).toFixed(1)),
    );
  });

  it("gives the SB no flat, and the BB nothing but a fold to the SB's re-raise", () => {
    const tree = blindDefense(100);
    expect(actionsAt(nodeAt(tree, ["raise"]))).toEqual(["fold", "raise", "allin"]);
    expect(actionsAt(nodeAt(tree, ["raise", "fold"]))).toEqual(["fold", "call", "raise", "allin"]);
    // The BB's forced fold is skipped: the button answers the SB's 3-bet next.
    expect(nodeAt(tree, ["raise", "raise"])).toMatchObject({ kind: "decision", player: 0 });
  });

  it("leaves only the all-in once a raise would take the whole stack", () => {
    expect(actionsAt(nodeAt(blindDefense(20), ["raise", "fold", "raise", "raise"]))).toEqual(["fold", "call", "allin"]);
  });

  it("ends every line heads-up, at a showdown when someone is all-in, and with the pot raked on the flop", () => {
    const tree = buildPreflopTree({
      format: gameFormatById("cash-6")!,
      stackBb: 100,
      rake: { structure: { id: "live", label: "Live", rate: 0.1, capBb: 3, stakes: "" }, noFlopNoDrop: true },
      seats: ["BTN", "SB", "BB"],
      rules: BLIND_DEFENSE_RULES,
    });
    for (const node of tree.terminals.filter((t) => t.outcome === "showdown")) expect(Math.max(...node.committed)).toBe(100);
    const called = nodeAt(tree, ["raise", "fold", "call"]);
    expect(called).toMatchObject({ kind: "terminal", outcome: "flop", ip: 0, oop: 2 });
    expect(called?.kind === "terminal" && called.pot).toBeCloseTo(5.5 - 0.55, 9);
    const stolen = nodeAt(tree, ["raise", "fold", "fold"]);
    expect(stolen?.kind === "terminal" && stolen.pot).toBe(4);
  });

  it("builds a shove-or-fold tree", () => {
    const tree = buildPreflopTree({ format: TOURNAMENT_8, stackBb: 10, seats: ["SB", "BB"], rules: PUSH_FOLD_RULES });
    expect(actionsAt(tree.root)).toEqual(["allin", "fold"]);
    expect(actionsAt(nodeAt(tree, ["allin"]))).toEqual(["call", "fold"]);
    expect(tree.terminals.map((t) => t.outcome).sort()).toEqual(["showdown", "uncontested", "uncontested"]);
  });
});
