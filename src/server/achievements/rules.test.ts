import { describe, expect, it } from "vitest";
import { currentStreak, describeRule } from "./rules";

describe("descriptions", () => {
  it("construites depuis la règle, accordées au singulier", () => {
    expect(describeRule("wagers_count", 1)).toBe("Miser sur un pari");
    expect(describeRule("wagers_count", 10)).toBe("Miser sur 10 paris");
    expect(describeRule("single_stake", 20)).toBe("Miser un paquet d'un coup");
    expect(describeRule("single_stake", 10)).toBe("Miser 10 clopes d'un coup");
    expect(describeRule("all_in", 10)).toBe("Faire tapis avec 10 clopes ou plus");
    expect(describeRule("wins_count", 1)).toBe("Gagner un pari");
    expect(describeRule("win_streak", 3)).toBe("Gagner 3 paris d'affilée");
    expect(describeRule("broke", null)).toBe("Finir à sec après un pari perdu");
    expect(describeRule("bets_created", 5)).toBe("Lancer 5 paris");
    expect(describeRule("purchases_count", 1)).toBe("Acheter un cosmétique");
  });
});

describe("série", () => {
  const at = (n: number, won: boolean, refund = false) => ({
    settledAt: new Date(2026, 0, n),
    betId: `b${n}`,
    won,
    refund,
  });

  it("un remboursé ne compte ni ne casse ; un perdu remet à zéro", () => {
    expect(currentStreak([at(1, true), at(2, true, true), at(3, true)])).toBe(2);
    expect(currentStreak([at(1, true), at(2, false), at(3, true)])).toBe(1);
    expect(currentStreak([at(1, true), at(2, true), at(3, false)])).toBe(0);
    expect(currentStreak([])).toBe(0);
  });
});
