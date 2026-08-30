import { describe, expect, it } from "vitest";
import { previewQuickAction } from "./preview";

describe("previewQuickAction", () => {
  it("returns null when the target isn't after the active seat", () => {
    expect(previewQuickAction([], "UTG", "UTG", 100)).toBeNull();
    expect(previewQuickAction([], "CO", "UTG", 100)).toBeNull();
  });

  it("computes CO's real opening options when everyone before it folds", () => {
    const actions = previewQuickAction([], "UTG", "CO", 100);
    expect(actions).not.toBeNull();
    expect(actions!.call).toBeNull(); // opening decision, nothing to call
    expect(actions!.raise).toEqual({ toBb: 3 }); // CO is IP-half: 3x BB
    expect(actions!.allin).toEqual({ toBb: 100 });
  });

  it("returns null for BB when folding everyone else would already resolve the hand", () => {
    expect(previewQuickAction([], "UTG", "BB", 100)).toBeNull();
  });

  it("computes BB's real options once an aggressor already exists in the path", () => {
    const actionPath = [{ actor: "UTG" as const, action: "raise" as const }];
    const actions = previewQuickAction(actionPath, "UTG1", "BB", 100);
    expect(actions).not.toBeNull();
    expect(actions!.call).not.toBeNull();
  });

  it("matches actual replay: folding UTG..HJ then previewing CO agrees with a direct replay to CO", () => {
    const actions = previewQuickAction([], "UTG", "CO", 40);
    expect(actions).toEqual({
      fold: true,
      call: null,
      raise: { toBb: 3 },
      allin: { toBb: 40 },
    });
  });
});
