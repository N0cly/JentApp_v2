import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { ledger, leagueMembers } from "@/db/schema";
import { formatOdds, getBet, listBets, resolveBet, settleDue } from "@/server/bets";
import { findBetDiscrepancies, findDiscrepancies } from "@/server/ledger";
import { at, betWithStakes, CLOSE } from "@/test/bet-scenarios";
import { leagueWith } from "@/test/bets";
import { resetDb } from "@/test/db";

// Spec §5 : 15 clopes sur A (7, 5, 3), 12 sur B, 8 sur C, cagnotte de 5,
// pot de 40. A gagne : 19, 13 et 8, cote finale x2.67.

async function balanceOf(leagueId: string, userId: string) {
  const [row] = await getDb()
    .select({ balance: leagueMembers.balance })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
  return row!.balance;
}

describe("scénario : l'exemple de la spec §5", () => {
  beforeEach(resetDb);

  it("se joue de bout en bout", async () => {
    const { league, owner, players } = await leagueWith(5, 50);
    const [a1, a2, a3, b, c] = players.map((p) => ({ id: p.id }));
    const bet = await betWithStakes(league.id, owner, [
      [a1!, 0, 7],
      [a2!, 0, 5],
      [a3!, 0, 3],
      [b!, 1, 12],
      [c!, 2, 8],
    ]);

    // Ouvert : pot et parieurs, sans répartition.
    const open = await getBet(c!, league.id, bet.betId, at(30));
    expect(open).toMatchObject({ state: "open", pot: 35, bettors: 5 });

    // Fermé : la répartition apparaît.
    const closed = await getBet(c!, league.id, bet.betId, CLOSE);
    if (closed.state !== "closed") throw new Error(closed.state);
    expect(closed.options.map((o) => o.amount)).toEqual([15, 12, 8]);

    // Le créateur saisit A ; la cagnotte de 5 s'ajoute.
    const resolvedAt = new Date(CLOSE.getTime() + 60_000);
    expect(
      await resolveBet(owner, league.id, bet.betId, { optionId: bet.options[0]! }, resolvedAt),
    ).toEqual({ ok: true });
    const pending = await getBet(a1!, league.id, bet.betId, resolvedAt);
    expect(pending).toMatchObject({ state: "resolved", pot: 40, seed: 5, myGain: 19 });
    if (pending.state === "resolved") expect(formatOdds(pending.oddsCents!)).toBe("x2.67");

    // Rien avant le délai, puis le versement.
    expect(await settleDue(league.id, new Date(resolvedAt.getTime() + 599_000))).toEqual({
      settled: 0,
      expired: 0,
    });
    expect(await settleDue(league.id, new Date(resolvedAt.getTime() + 600_000))).toEqual({
      settled: 1,
      expired: 0,
    });

    expect(await balanceOf(league.id, a1!.id)).toBe(50 - 7 + 19);
    expect(await balanceOf(league.id, a2!.id)).toBe(50 - 5 + 13);
    expect(await balanceOf(league.id, a3!.id)).toBe(50 - 3 + 8);
    expect(await balanceOf(league.id, b!.id)).toBe(50 - 12);
    expect(await balanceOf(league.id, c!.id)).toBe(50 - 8);

    const payouts = await getDb()
      .select()
      .from(ledger)
      .where(and(eq(ledger.refId, bet.betId), eq(ledger.reason, "payout")));
    expect(payouts.reduce((s, l) => s + l.delta, 0)).toBe(40);

    const settled = await getBet(
      b!,
      league.id,
      bet.betId,
      new Date(resolvedAt.getTime() + 601_000),
    );
    expect(settled).toMatchObject({ state: "settled", oddsCents: 267, myGain: 0 });
    expect(
      (await listBets(b!, league.id, new Date(resolvedAt.getTime() + 601_000))).map((v) => v.id),
    ).toContain(bet.betId);

    expect(await findDiscrepancies(getDb())).toEqual([]);
    expect(await findBetDiscrepancies(getDb())).toEqual([]);
  });
});
