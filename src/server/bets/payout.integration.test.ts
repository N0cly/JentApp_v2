import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { bets, ledger, leagueMembers, wagers } from "@/db/schema";
import { findDiscrepancies } from "@/server/ledger";
import { leaveLeague } from "@/server/leagues";
import { betWithStakes, CLOSE } from "@/test/bet-scenarios";
import { leagueWith } from "@/test/bets";
import { resetDb } from "@/test/db";
import { settleDue } from "./payout";
import { resolveBet } from "./result";

const after = (minutes: number) => new Date(CLOSE.getTime() + minutes * 60_000);

async function balanceOf(leagueId: string, userId: string) {
  const [row] = await getDb()
    .select({ balance: leagueMembers.balance })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
  return row!.balance;
}

async function setup() {
  const ctx = await leagueWith(3);
  const [p1, p2, p3] = [ctx.players[0]!, ctx.players[1]!, ctx.players[2]!];
  const bet = await betWithStakes(ctx.league.id, ctx.owner, [
    [p1, 0, 10],
    [p2, 0, 5],
    [p3, 1, 9],
  ]);
  return { ...ctx, p1, p2, p3, ...bet };
}

describe("versement", () => {
  beforeEach(resetDb);

  it("rien avant le délai ; ensuite les gains, payout rempli et settled_at", async () => {
    const s = await setup();
    await resolveBet(s.owner, s.league.id, s.betId, { optionId: s.options[0]! }, after(1));
    expect(await settleDue(s.league.id, after(10))).toEqual({ settled: 0, expired: 0 });
    expect(await balanceOf(s.league.id, s.p1.id)).toBe(40);

    expect(await settleDue(s.league.id, after(11))).toEqual({ settled: 1, expired: 0 });
    // Pot 24 + cagnotte 5 = 29 sur W 15 : 10 → 19 (r 5), 5 → 9 (r 10) ; reste 1 → p2.
    expect(await balanceOf(s.league.id, s.p1.id)).toBe(40 + 19);
    expect(await balanceOf(s.league.id, s.p2.id)).toBe(45 + 10);
    expect(await balanceOf(s.league.id, s.p3.id)).toBe(41);
    const rows = await getDb().select().from(wagers).where(eq(wagers.betId, s.betId));
    expect(Object.fromEntries(rows.map((w) => [w.userId, w.payout]))).toEqual({
      [s.p1.id]: 19,
      [s.p2.id]: 10,
      [s.p3.id]: 0,
    });
    const [bet] = await getDb().select().from(bets).where(eq(bets.id, s.betId));
    expect(bet?.settledAt).toEqual(after(11));
    expect(await findDiscrepancies(getDb())).toEqual([]);
  });

  it("dix settleDue simultanés : un seul versement", async () => {
    const s = await setup();
    await resolveBet(s.owner, s.league.id, s.betId, { optionId: s.options[0]! }, after(1));
    const results = await Promise.all(
      Array.from({ length: 10 }, () => settleDue(s.league.id, after(12))),
    );
    expect(results.reduce((n, r) => n + r.settled, 0)).toBe(1);
    expect(await getDb().select().from(ledger).where(eq(ledger.reason, "payout"))).toHaveLength(2);
  });

  it("expiration à 7 jours sans résultat : annulé et remboursé", async () => {
    const s = await setup();
    expect(await settleDue(s.league.id, after(7 * 24 * 60 - 1))).toEqual({
      settled: 0,
      expired: 0,
    });
    expect(await settleDue(s.league.id, after(7 * 24 * 60))).toEqual({ settled: 0, expired: 1 });
    const [bet] = await getDb().select().from(bets).where(eq(bets.id, s.betId));
    expect(bet).toMatchObject({ cancelReason: "expired", cancelledBy: null });
    expect(await balanceOf(s.league.id, s.p1.id)).toBe(50);
  });

  it("la part d'un membre parti va sur son solde gelé", async () => {
    const s = await setup();
    await leaveLeague(s.p1, s.league.id, after(0));
    await resolveBet(s.owner, s.league.id, s.betId, { optionId: s.options[0]! }, after(1));
    await settleDue(s.league.id, after(11));
    expect(await balanceOf(s.league.id, s.p1.id)).toBe(59);
  });

  it("aucun perdant : remboursement, sans cagnotte", async () => {
    const ctx = await leagueWith(3);
    const [p1, p2, p3] = [ctx.players[0]!, ctx.players[1]!, ctx.players[2]!];
    const b = await betWithStakes(ctx.league.id, ctx.owner, [
      [p1, 0, 4],
      [p2, 0, 6],
      [p3, 0, 2],
    ]);
    await resolveBet(ctx.owner, ctx.league.id, b.betId, { optionId: b.options[0]! }, after(1));
    await settleDue(ctx.league.id, after(11));
    expect([await balanceOf(ctx.league.id, p1.id), await balanceOf(ctx.league.id, p2.id)]).toEqual([
      50, 50,
    ]);
    expect(await getDb().select().from(ledger).where(eq(ledger.reason, "refund"))).toHaveLength(3);
  });
});
