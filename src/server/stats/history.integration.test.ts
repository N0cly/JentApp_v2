import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { cancelBet, createBet, placeWager, resolveBet, settleDue } from "@/server/bets";
import { joinLeague } from "@/server/leagues";
import { at, CLOSE, T0 } from "@/test/bet-scenarios";
import { leagueWith, optionIds } from "@/test/bets";
import { resetDb } from "@/test/db";
import { getMyHistory, HISTORY_PAGE_SIZE, memberHistory } from "./history";

const after = (minutes: number) => new Date(CLOSE.getTime() + minutes * 60_000);

/** Pari ouvert à T0 qui ferme à `closesAt`, avec ses mises : [joueur, option, montant]. */
async function stakedBet(
  leagueId: string,
  creator: { id: string },
  closesAt: Date,
  stakes: [{ id: string }, number, number][],
  question = "Qui gagne ?",
) {
  const created = await createBet(
    creator,
    leagueId,
    { question, options: ["Oui", "Non"], moment: "NIGHT", closesAt: closesAt.toISOString() },
    T0,
  );
  if (!created.ok) throw new Error(JSON.stringify(created));
  const options = await optionIds(created.betId);
  for (const [user, index, amount] of stakes) {
    const result = await placeWager(
      user,
      leagueId,
      created.betId,
      { optionId: options[index]!, amount, ticketId: randomUUID() },
      at(1),
    );
    if (!result.ok) throw new Error(result.error);
  }
  return { betId: created.betId, options };
}

describe("historique", () => {
  beforeEach(resetDb);

  it("tous les états, dans l'ordre", async () => {
    const ctx = await leagueWith(3);
    const [p1, p2, p3] = [ctx.players[0]!, ctx.players[1]!, ctx.players[2]!];
    const id = ctx.league.id;
    const o = ctx.owner;
    const trio = (a: number): [{ id: string }, number, number][] => [
      [p1, 0, a],
      [p2, 1, 3],
      [p3, 1, 1],
    ];

    const won = await stakedBet(id, o, CLOSE, trio(4), "gagné");
    const lost = await stakedBet(id, o, CLOSE, trio(2), "perdu");
    const refunded = await stakedBet(id, o, CLOSE, [[p1, 0, 2]], "remboursé");
    const cancelled = await stakedBet(id, o, CLOSE, trio(1), "annulé");
    const tie = await stakedBet(id, o, CLOSE, trio(1), "égalité");
    const resolved = await stakedBet(id, o, at(110), trio(1), "saisi");
    const closed = await stakedBet(id, o, CLOSE, trio(1), "fermé");
    const later = await stakedBet(id, o, at(400), trio(1), "ouvert tard");
    const soon = await stakedBet(id, o, at(300), trio(1), "ouvert tôt");

    await cancelBet(o, id, cancelled.betId, at(2));
    await resolveBet(o, id, won.betId, { optionId: won.options[0]! }, after(1));
    await settleDue(id, after(12));
    await resolveBet(o, id, lost.betId, { optionId: lost.options[1]! }, after(13));
    await settleDue(id, after(24));
    await resolveBet(o, id, refunded.betId, { optionId: refunded.options[0]! }, after(25));
    await settleDue(id, after(36));
    await resolveBet(o, id, tie.betId, { cancel: true }, after(37));
    await resolveBet(o, id, resolved.betId, { optionId: resolved.options[0]! }, after(38));

    const now = after(40);
    const { items, hasMore } = await memberHistory(id, p1.id, 0, now);
    expect(hasMore).toBe(false);
    expect(items.map((i) => i.question)).toEqual([
      "saisi",
      "fermé",
      "ouvert tôt",
      "ouvert tard",
      "égalité",
      "remboursé",
      "perdu",
      "gagné",
      "annulé",
    ]);
    const byQuestion = Object.fromEntries(items.map((i) => [i.question, i]));
    expect(byQuestion["ouvert tôt"]).toMatchObject({
      betId: soon.betId,
      option: "Oui",
      amount: 1,
      outcome: { kind: "open", closesAt: at(300) },
    });
    expect(byQuestion["ouvert tard"]!.betId).toBe(later.betId);
    expect(byQuestion["fermé"]).toMatchObject({ betId: closed.betId, outcome: { kind: "closed" } });
    expect(byQuestion["saisi"]!.outcome).toEqual({
      kind: "resolved",
      settlesAt: new Date(after(38).getTime() + 600_000),
    });
    // Pot 8 + cagnotte 5 pour une mise de 4 seule sur Oui : 13, soit +9.
    expect(byQuestion["gagné"]).toMatchObject({ amount: 4, outcome: { kind: "won", net: 9 } });
    expect(byQuestion["perdu"]).toMatchObject({ amount: 2, outcome: { kind: "lost", net: -2 } });
    expect(byQuestion["remboursé"]!.outcome).toEqual({ kind: "refunded" });
    expect(byQuestion["égalité"]!.outcome).toEqual({ kind: "cancelled", reason: "tie" });
    expect(byQuestion["annulé"]!.outcome).toEqual({ kind: "cancelled", reason: "cancelled" });
  });

  it("annulé au bout de 7 jours sans résultat", async () => {
    const ctx = await leagueWith(1);
    const p1 = ctx.players[0]!;
    await stakedBet(ctx.league.id, ctx.owner, CLOSE, [[p1, 0, 2]]);
    const week = new Date(CLOSE.getTime() + 7 * 24 * 3600_000);
    await settleDue(ctx.league.id, week);
    const { items } = await memberHistory(ctx.league.id, p1.id, 0, week);
    expect(items[0]!.outcome).toEqual({ kind: "cancelled", reason: "expired" });
  });

  it("pages de 20, sans doublon ni trou", async () => {
    const ctx = await leagueWith(1);
    const p1 = ctx.players[0]!;
    const created = [];
    for (let i = 0; i < 25; i++) {
      created.push((await stakedBet(ctx.league.id, ctx.owner, at(200 + i), [[p1, 0, 1]])).betId);
    }
    const first = await memberHistory(ctx.league.id, p1.id, 0, at(5));
    const second = await memberHistory(ctx.league.id, p1.id, 1, at(5));
    expect(first.items).toHaveLength(HISTORY_PAGE_SIZE);
    expect(first.hasMore).toBe(true);
    expect(second.items).toHaveLength(5);
    expect(second.hasMore).toBe(false);
    expect([...first.items, ...second.items].map((i) => i.betId)).toEqual(created);
    expect((await memberHistory(ctx.league.id, p1.id, 2, at(5))).items).toEqual([]);
  });

  it("les mises d'une autre ligue n'y figurent pas", async () => {
    const a = await leagueWith(1);
    const p1 = a.players[0]!;
    const b = await leagueWith(0);
    await stakedBet(a.league.id, a.owner, CLOSE, [[p1, 0, 1]]);
    await joinLeague(p1, b.league.inviteCode, T0);
    await stakedBet(b.league.id, b.owner, CLOSE, [[p1, 0, 1]], "ailleurs");
    const { items } = await memberHistory(a.league.id, p1.id, 0, at(5));
    expect(items.map((i) => i.question)).toEqual(["Qui gagne ?"]);
  });

  it("non-membre : 404", async () => {
    const a = await leagueWith(0);
    const b = await leagueWith(0);
    await expect(getMyHistory(b.owner, a.league.id, 0, T0)).rejects.toMatchObject({ status: 404 });
  });
});
