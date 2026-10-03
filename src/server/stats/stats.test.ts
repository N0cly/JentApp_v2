import { describe, expect, it } from "vitest";
import { rankingCard, rankRows } from "./ranking";
import { computeStats, NO_STATS, successRate } from "./stats";

const stake = (amount: number, payout: number, won: boolean, refund = false) => ({
  userId: "u",
  amount,
  payout,
  won,
  refund,
});

describe("chiffres", () => {
  it("un gagné, un perdu, un remboursé : 2 paris, 1 gagné, 50 %", () => {
    expect(
      computeStats([stake(10, 19, true), stake(8, 0, false), stake(4, 4, true, true)]),
    ).toEqual({ bets: 2, won: 1, successRate: 50, net: 9 - 8 });
  });

  it("aucun pari : réussite vide", () => {
    expect(computeStats([])).toEqual(NO_STATS);
    expect(successRate(0, 0)).toBeNull();
  });

  it("un gagnant qui reçoit exactement sa mise compte comme gagné", () => {
    expect(computeStats([stake(1, 1, true)])).toEqual({
      bets: 1,
      won: 1,
      successRate: 100,
      net: 0,
    });
  });

  it("réussite arrondie à l'entier le plus proche", () => {
    expect(successRate(7, 12)).toBe(58);
    expect(successRate(4, 9)).toBe(44);
    expect(successRate(1, 3)).toBe(33);
    expect(successRate(2, 3)).toBe(67);
    expect(successRate(1, 8)).toBe(13);
  });
});

const row = (userId: string, balance: number, net: number, joined: number) => ({
  userId,
  username: userId.toUpperCase(),
  image: null,
  ring: null,
  role: "player" as const,
  balance,
  joinedAt: new Date(2026, 0, joined),
  stats: { ...NO_STATS, net },
});

describe("tris", () => {
  const rows = [row("a", 50, 3, 1), row("b", 80, -5, 2), row("c", 50, 9, 3), row("d", 50, 9, 2)];

  it("fortune : solde, puis bilan, puis ancienneté", () => {
    expect(rankRows(rows, "fortune").map((r) => [r.userId, r.rank])).toEqual([
      ["b", 1],
      ["d", 2],
      ["c", 3],
      ["a", 4],
    ]);
  });

  it("bilan net : bilan, puis solde, puis ancienneté", () => {
    const more = [...rows, row("e", 90, 9, 4)];
    expect(rankRows(more, "net").map((r) => r.userId)).toEqual(["e", "d", "c", "a", "b"]);
  });
});

describe("carte sous ma ligne", () => {
  const fortune = rankRows(
    [row("a", 150, 0, 1), row("b", 85, 0, 2), row("c", 64, 0, 3)],
    "fortune",
  );

  it("écart avec le membre du dessus", () => {
    expect(rankingCard(fortune, "c", 2)).toEqual({
      kind: "behind",
      gap: 21,
      rival: "B",
      openBets: 2,
    });
  });

  it("variante du premier", () => {
    expect(rankingCard(fortune, "a", 0)).toEqual({
      kind: "leader",
      lead: 65,
      rival: "B",
      openBets: 0,
    });
  });

  it("membre seul", () => {
    expect(rankingCard(rankRows([row("a", 50, 0, 1)], "fortune"), "a", 3)).toEqual({
      kind: "alone",
    });
  });

  it("hors du classement : pas de carte", () => {
    expect(rankingCard(fortune, "z", 1)).toBeNull();
  });
});
