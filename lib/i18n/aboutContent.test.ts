import { describe, expect, it } from "vitest";
import { USER_DAILY_LIMIT } from "@/lib/explain/usage";
import { NASH_FLAT_STACK_THRESHOLD_BB } from "@/lib/solveEngine/constants";
import { DEFAULT_TARGET_EXPLOITABILITY_PERCENT } from "@/lib/postflopSolver/cfr";
import { BET_SIZING } from "@/lib/postflopSolver/betAbstraction";
import { ALLIN_OPEN_MAX_SPR } from "@/lib/postflopSolver/betAbstraction";
import { aboutContent } from "./aboutContent";

const en = aboutContent("en");
const ko = aboutContent("ko");
const text = (content: typeof en) => content.sections.flatMap((s) => [...(s.paragraphs ?? []), ...(s.items ?? [])]).join("\n");

describe("aboutContent", () => {
  it("has the same sections, in the same shape, in both languages", () => {
    expect(ko.sections.map((s) => s.id)).toEqual(en.sections.map((s) => s.id));
    en.sections.forEach((section, i) => {
      expect(ko.sections[i].paragraphs?.length).toBe(section.paragraphs?.length);
      expect(ko.sections[i].items?.length).toBe(section.items?.length);
      expect(ko.sections[i].ordered).toBe(section.ordered);
    });
  });

  it("has the anchors other pages link to", () => {
    expect(en.sections.map((s) => s.id)).toEqual(expect.arrayContaining(["preflop", "postflop", "accuracy", "limits", "feedback"]));
  });

  it("writes the solver's own bet sizes, with nothing left to fill in", () => {
    const flop = BET_SIZING.flop.betPotFractions.map((f) => `${Math.round(f * 100)}%`);
    for (const content of [en, ko]) {
      for (const size of flop) expect(text(content)).toContain(size);
      expect(text(content)).not.toMatch(/[{}]/);
    }
    expect(text(en)).toContain(`out of ${flop.slice(0, -1).join(", ")} or ${flop.at(-1)} of the pot`);
    expect(text(en)).toContain(`at most ${ALLIN_OPEN_MAX_SPR.flop} pots, or ${ALLIN_OPEN_MAX_SPR.river} on the river`);
  });

  it("quotes the limits the code enforces", () => {
    for (const content of [en, ko]) {
      const body = text(content);
      expect(body).toMatch(new RegExp(`\\b${USER_DAILY_LIMIT}(회| explanations)`));
      expect(body).toContain(`${NASH_FLAT_STACK_THRESHOLD_BB}`);
      expect(body).toContain(`${DEFAULT_TARGET_EXPLOITABILITY_PERCENT}%`);
    }
  });
});
