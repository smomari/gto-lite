import { describe, expect, it } from "vitest";
import { loadEquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { HAND_BY_LABEL } from "@/lib/handRange/handList";
import type { HandFrequency, Position } from "@/types/rangeData";
import { initialPotState, applyAction, type PotState } from "./potState";
import { solveActiveSeat } from "./solve";

const matrix = loadEquityMatrix();

function combosWith(hands: HandFrequency[], freq: (h: HandFrequency) => number): number {
  return hands.reduce((sum, h) => sum + freq(h) * HAND_BY_LABEL.get(h.hand)!.combos, 0);
}

describe("solveActiveSeat", () => {
  it("opens with raises, not shoves, above the flat Nash threshold", () => {
    const result = solveActiveSeat(matrix, "BTN", initialPotState(), 20);
    expect(result.source).toBe("heuristic-approx");
    expect(combosWith(result.hands, (h) => h.allin ?? 0)).toBe(0);
    expect(combosWith(result.hands, (h) => h.raise) / 1326).toBeCloseTo(0.42, 1);
  });

  it("defends the BB against a button open with most of its hands, far more than the seats that don't close the action", () => {
    const state = (...seats: Position[]) =>
      seats.reduce(
        (s, seat) =>
          seat === "BTN"
            ? applyAction(s, seat, "raise", { effectiveStackBb: 40, raiseToBb: 2 })
            : applyAction(s, seat, "fold", { effectiveStackBb: 40 }),
        initialPotState(),
      );
    const fold = (seat: Position, s: PotState) => combosWith(solveActiveSeat(matrix, seat, s, 40).hands, (h) => h.fold) / 1326;
    const toSb = state("UTG", "UTG1", "LJ", "HJ", "CO", "BTN");
    expect(fold("BB", applyAction(toSb, "SB", "fold", { effectiveStackBb: 40 }))).toBeLessThan(0.3);
    expect(fold("SB", toSb)).toBeGreaterThan(0.6);
  });

  it("routes a shallow-stack opening spot to Nash and produces allin-only frequencies", () => {
    const result = solveActiveSeat(matrix, "UTG", initialPotState(), 15);
    expect(result.source).toBe("nash-shove-fold");
    for (const h of result.hands) {
      expect(h.call).toBe(0);
      expect(h.raise).toBe(0);
      expect(h.fold + (h.allin ?? 0)).toBeCloseTo(1, 6);
    }
    const aa = result.hands.find((h) => h.hand === "AA")!;
    expect(aa.allin).toBeGreaterThan(0.9);
  });

  it("shoves tighter the more players are left to act: UTG < BTN", () => {
    const shoves = (seat: "UTG" | "BTN") => combosWith(solveActiveSeat(matrix, seat, initialPotState(), 10).hands, (h) => h.allin ?? 0);
    expect(shoves("UTG")).toBeLessThan(shoves("BTN"));
    expect(shoves("UTG") / 1326).toBeLessThan(0.25);
  });

  it("calls an UTG shove tighter than a SB shove", () => {
    const calls = (shover: "UTG" | "SB") => {
      const state = applyAction(initialPotState(), shover, "allin", { effectiveStackBb: 10 });
      return combosWith(solveActiveSeat(matrix, "BB", state, 10).hands, (h) => h.call);
    };
    expect(calls("UTG")).toBeLessThan(calls("SB"));
  });

  it("routes a 100bb opening spot to the heuristic engine and produces raise-only frequencies (non-SB — SB splits three ways)", () => {
    const result = solveActiveSeat(matrix, "BTN", initialPotState(), 100);
    expect(result.source).toBe("heuristic-approx");
    for (const h of result.hands) {
      expect(h.call).toBe(0);
      expect(h.allin ?? 0).toBe(0);
      expect(h.fold + h.raise).toBeCloseTo(1, 6);
    }
  });

  const foldedToSb = (stackBb: number) =>
    (["UTG", "UTG1", "LJ", "HJ", "CO", "BTN"] as Position[]).reduce(
      (state, seat) => applyAction(state, seat, "fold", { effectiveStackBb: stackBb }),
      initialPotState(),
    );

  it("splits SB's first-in range into raises, limps and folds, mostly limps", () => {
    for (const stackBb of [20, 40, 100]) {
      const result = solveActiveSeat(matrix, "SB", foldedToSb(stackBb), stackBb);
      expect(result.source).toBe("heuristic-approx");
      for (const h of result.hands) expect(h.fold + h.call + h.raise).toBeCloseTo(1, 6);
      const raises = combosWith(result.hands, (h) => h.raise);
      const limps = combosWith(result.hands, (h) => h.call);
      expect(limps).toBeGreaterThan(raises);
      expect((raises + limps) / 1326).toBeGreaterThan(0.75);
      expect(result.hands.find((h) => h.hand === "AA")!.raise).toBeCloseTo(1, 6);
    }
  });

  it("stays push/fold for SB at the Nash stacks, where limping isn't offered", () => {
    const result = solveActiveSeat(matrix, "SB", foldedToSb(15), 15);
    expect(result.source).toBe("nash-shove-fold");
    expect(combosWith(result.hands, (h) => h.call)).toBe(0);
  });

  it("has BB raise or check behind a limp, never fold", () => {
    const limped = applyAction(foldedToSb(40), "SB", "call", { effectiveStackBb: 40 });
    const result = solveActiveSeat(matrix, "BB", limped, 40);
    expect(combosWith(result.hands, (h) => h.fold)).toBe(0);
    expect(combosWith(result.hands, (h) => h.raise) / 1326).toBeCloseTo(0.4, 1);
    expect(result.hands.find((h) => h.hand === "AA")!.raise).toBeCloseTo(1, 6);
  });

  it("treats SB as closing the action against BB's raise over a limp", () => {
    const limped = applyAction(foldedToSb(40), "SB", "call", { effectiveStackBb: 40 });
    const raised = applyAction(limped, "BB", "raise", { effectiveStackBb: 40, raiseToBb: 3.5 });
    const result = solveActiveSeat(matrix, "SB", raised, 40);
    expect(combosWith(result.hands, (h) => h.fold) / 1326).toBeLessThan(0.5);
  });

  it("produces call+raise summing correctly with fold for a deep-stack facing-raise spot", () => {
    const state = applyAction(initialPotState(), "UTG", "raise", { effectiveStackBb: 100, raiseToBb: 4 });
    const result = solveActiveSeat(matrix, "CO", state, 100);
    expect(result.source).toBe("heuristic-approx");
    for (const h of result.hands) {
      expect(h.fold + h.call + h.raise).toBeCloseTo(1, 6);
    }
  });

  it("routes to Nash for a facing-raise spot with a low remaining stack-to-pot ratio, even at a stack above the flat threshold", () => {
    let state = applyAction(initialPotState(), "UTG", "raise", { effectiveStackBb: 40, raiseToBb: 4 });
    state = applyAction(state, "BB", "raise", { effectiveStackBb: 40, raiseToBb: 12 });
    // UTG shoves the rest of a 40bb stack over BB's 3-bet — BB now faces a big
    // pot relative to its own remaining stack (28bb behind a 53.5bb pot),
    // which should classify as Nash despite the 40bb starting stack being
    // above the flat 25bb threshold.
    state = applyAction(state, "UTG", "allin", { effectiveStackBb: 40 });
    const result = solveActiveSeat(matrix, "BB", state, 40);
    expect(result.source).toBe("nash-shove-fold");
    for (const h of result.hands) {
      expect(h.raise).toBe(0);
      expect(h.fold + h.call).toBeCloseTo(1, 6);
    }
  });
});
