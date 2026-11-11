import { describe, expect, it } from "vitest";
import { MESSAGES } from "./messages";

/** Every key path, with its kind: a missing or mistyped translation shows up as a difference. */
function shape(value: unknown, path = ""): string[] {
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, child]) => shape(child, `${path}.${key}`));
  }
  return [`${path}:${typeof value}`];
}

describe("MESSAGES", () => {
  it("translates every English key into Korean", () => {
    expect(shape(MESSAGES.ko)).toEqual(shape(MESSAGES.en));
  });

  it("shows engine action labels in Korean, keeping the sizes", () => {
    const { action } = MESSAGES.ko;
    expect(action("Fold")).toBe("폴드");
    expect(action("Check")).toBe("체크");
    expect(action("Call")).toBe("콜");
    expect(action("Limp")).toBe("림프");
    expect(action("Bet 3.3bb")).toBe("벳 3.3bb");
    expect(action("Raise to 12.0bb")).toBe("레이즈 12.0bb");
    expect(action("Raise 2.5bb")).toBe("레이즈 2.5bb");
    expect(action("Allin 100bb")).toBe("올인 100bb");
    expect(MESSAGES.en.action("Raise to 12.0bb")).toBe("Raise to 12.0bb");
  });

  it("translates known solver errors and passes the rest through", () => {
    expect(MESSAGES.ko.errorMessage("This line is never reached at equilibrium.")).toBe("균형 전략에서는 이 라인에 도달하지 않습니다.");
    expect(MESSAGES.ko.errorMessage("Request failed (500)")).toBe("Request failed (500)");
  });
});
