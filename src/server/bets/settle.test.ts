import { describe, expect, it } from "vitest";
import { formatOdds, settle, type Stake } from "./settle";

const t = (n: number) => new Date(Date.UTC(2026, 9, 7, 18, 0, n));
const stake = (userId: string, optionId: string, amount: number, at = 0): Stake => ({
  userId,
  optionId,
  amount,
  createdAt: t(at),
});

describe("settle", () => {
  it("l'exemple de la spec : 19, 13, 8, cote x2.67", () => {
    const result = settle({
      stakes: [
        stake("a1", "A", 7),
        stake("a2", "A", 5),
        stake("a3", "A", 3),
        stake("b", "B", 12),
        stake("c", "C", 8),
      ],
      winningOptionId: "A",
      seed: 5,
    });
    expect(result.kind).toBe("payout");
    if (result.kind !== "payout") return;
    expect(result.pot).toBe(40);
    expect(Object.fromEntries(result.payouts)).toEqual({ a1: 19, a2: 13, a3: 8, b: 0, c: 0 });
    expect(formatOdds(result.oddsCents)).toBe("x2.67");
  });

  it("aucun gagnant, aucun perdant, un seul parieur : remboursement sans cagnotte", () => {
    const noWinner = settle({
      stakes: [stake("a", "A", 5), stake("b", "B", 7)],
      winningOptionId: "C",
      seed: 5,
    });
    const noLoser = settle({
      stakes: [stake("a", "A", 5), stake("b", "A", 7)],
      winningOptionId: "A",
      seed: 5,
    });
    const alone = settle({ stakes: [stake("a", "A", 9)], winningOptionId: "A", seed: 5 });
    for (const r of [noWinner, noLoser, alone]) expect(r.kind).toBe("refund");
    expect(Object.fromEntries(noWinner.payouts)).toEqual({ a: 5, b: 7 });
    expect(Object.fromEntries(alone.payouts)).toEqual({ a: 9 });
  });

  it("départage du reste par la mise, puis l'ancienneté, puis user_id", () => {
    // Pot 10 sur 3 gagnants à mises égales (1, 1, 1) : 3 chacun, une clope de reste.
    const byAge = settle({
      stakes: [
        stake("z", "A", 1, 1),
        stake("y", "A", 1, 0),
        stake("x", "A", 1, 2),
        stake("l", "B", 7),
      ],
      winningOptionId: "A",
      seed: 0,
    });
    expect(Object.fromEntries(byAge.payouts)).toMatchObject({ y: 4, z: 3, x: 3 });
    // Restes égaux, mises différentes : la plus grosse mise d'abord.
    const byStake = settle({
      stakes: [stake("p", "A", 2, 0), stake("q", "A", 4, 1), stake("l", "B", 1)],
      winningOptionId: "A",
      seed: 0,
    });
    // Pot 7 sur W 6 : 2×7/6 = 2 r2, 4×7/6 = 4 r4 → le reste 4 l'emporte, 1 clope en trop.
    expect(Object.fromEntries(byStake.payouts)).toMatchObject({ p: 2, q: 5 });
    const tie = settle({
      stakes: [stake("b", "A", 1, 0), stake("a", "A", 1, 0), stake("l", "B", 1)],
      winningOptionId: "A",
      seed: 0,
    });
    // Pot 3, W 2 : 1 r1 chacun ; même mise, même date : le plus petit user_id.
    expect(Object.fromEntries(tie.payouts)).toMatchObject({ a: 2, b: 1 });
  });

  it("règle 5 : sur des tirages aléatoires, la somme des gains égale le pot et chaque gagnant reçoit au moins sa mise", () => {
    let seedValue = 42;
    const random = () => {
      seedValue = (seedValue * 1103515245 + 12345) % 2 ** 31;
      return seedValue / 2 ** 31;
    };
    for (let round = 0; round < 2000; round++) {
      const options = ["A", "B", "C", "D"].slice(0, 2 + Math.floor(random() * 3));
      const stakes = Array.from({ length: 1 + Math.floor(random() * 12) }, (_, i) =>
        stake(
          `u${i}`,
          options[Math.floor(random() * options.length)]!,
          1 + Math.floor(random() * 200),
          Math.floor(random() * 50),
        ),
      );
      const seed = Math.floor(random() * 21);
      const winner = options[Math.floor(random() * options.length)]!;
      const result = settle({ stakes, winningOptionId: winner, seed });
      const paid = [...result.payouts.values()].reduce((a, b) => a + b, 0);
      const total = stakes.reduce((a, s) => a + s.amount, 0);
      if (result.kind === "refund") {
        expect(paid).toBe(total);
        continue;
      }
      expect(paid).toBe(total + seed);
      for (const s of stakes) {
        if (s.optionId === winner)
          expect(result.payouts.get(s.userId)).toBeGreaterThanOrEqual(s.amount);
        else expect(result.payouts.get(s.userId)).toBe(0);
        expect(Number.isInteger(result.payouts.get(s.userId))).toBe(true);
      }
    }
  });

  it("cote arrondie au centième", () => {
    expect(formatOdds(275)).toBe("x2.75");
    expect(formatOdds(100)).toBe("x1.00");
    const r = settle({
      stakes: [stake("a", "A", 3), stake("b", "B", 1)],
      winningOptionId: "A",
      seed: 0,
    });
    if (r.kind === "payout") expect(formatOdds(r.oddsCents)).toBe("x1.33");
  });
});
