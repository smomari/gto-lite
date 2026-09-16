import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { CardChip } from "./CardChip";

describe("CardChip", () => {
  it("renders the rank and the correct suit symbol for each suit", () => {
    const cases: [string, string][] = [
      ["As", "♠"],
      ["Kh", "♥"],
      ["Qd", "♦"],
      ["Jc", "♣"],
    ];
    for (const [card, symbol] of cases) {
      const { container } = render(<CardChip card={card} />);
      const chip = container.querySelector(`[data-card="${card}"]`);
      expect(chip).not.toBeNull();
      expect(chip!.textContent).toBe(`${card[0]}${symbol}`);
    }
  });

  it("gives each suit a visually distinct color class", () => {
    const suitedCards = ["As", "Ah", "Ad", "Ac"];
    const classSets = suitedCards.map((card) => {
      const { container } = render(<CardChip card={card} />);
      return container.querySelector(`[data-card="${card}"]`)!.className;
    });
    expect(new Set(classSets).size).toBe(suitedCards.length);
  });

  it("renders an empty dashed placeholder when no card is given", () => {
    const { container } = render(<CardChip />);
    expect(container.querySelector("[data-card]")).toBeNull();
    expect(container.querySelector(".border-dashed")).not.toBeNull();
  });

  it("is decorative (aria-hidden) so it never overrides a wrapping button's accessible name", () => {
    const { container } = render(<CardChip card="Th" />);
    expect(container.firstChild).toHaveAttribute("aria-hidden");
  });
});
