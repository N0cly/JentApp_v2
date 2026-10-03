import { and, eq, isNotNull, sum } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { bets, leagueMembers, leagues, wagers } from "@/db/schema";
import { deleteAccount } from "@/server/account/delete";
import { cancelBet, createBet, resolveBet, settleDue } from "@/server/bets";
import { leaveLeague } from "@/server/leagues";
import { at, betWithStakes, CLOSE, T0 } from "@/test/bet-scenarios";
import { leagueWith } from "@/test/bets";
import { resetDb } from "@/test/db";
import { countOpenBets, getRanking, leagueRanking, nextRankingChange } from "./ranking";
import { leagueStats, memberStats } from "./stats";

const after = (minutes: number) => new Date(CLOSE.getTime() + minutes * 60_000);

async function payoutOf(betId: string, userId: string) {
  const [row] = await getDb()
    .select({ payout: wagers.payout })
    .from(wagers)
    .where(and(eq(wagers.betId, betId), eq(wagers.userId, userId)));
  return row!.payout!;
}

async function setBalance(leagueId: string, userId: string, balance: number) {
  // Fixture : soldes posés directement pour tester les départages du tri.
  await getDb()
    .update(leagueMembers)
    .set({ balance })
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
}

/**
 * p1 : un pari gagné, un perdu, un remboursé, un annulé, un sans résultat et
 * un en attente de versement.
 */
async function sixBets() {
  const ctx = await leagueWith(3);
  const [p1, p2, p3] = [ctx.players[0]!, ctx.players[1]!, ctx.players[2]!];
  const id = ctx.league.id;
  // Trois parieurs : ces deux paris reçoivent la cagnotte.
  const won = await betWithStakes(id, ctx.owner, [
    [p1, 0, 10],
    [p2, 1, 5],
    [p3, 1, 1],
  ]);
  const lost = await betWithStakes(id, ctx.owner, [
    [p1, 0, 4],
    [p2, 1, 6],
    [p3, 1, 2],
  ]);
  const refunded = await betWithStakes(id, ctx.owner, [[p1, 0, 3]]);
  const cancelled = await betWithStakes(id, ctx.owner, [
    [p1, 0, 7],
    [p2, 1, 2],
  ]);
  const open = await betWithStakes(id, ctx.owner, [
    [p1, 0, 2],
    [p2, 1, 2],
  ]);
  const pending = await betWithStakes(id, ctx.owner, [
    [p1, 0, 5],
    [p2, 1, 5],
  ]);
  await resolveBet(ctx.owner, id, won.betId, { optionId: won.options[0]! }, after(1));
  await resolveBet(ctx.owner, id, lost.betId, { optionId: lost.options[1]! }, after(1));
  await resolveBet(ctx.owner, id, refunded.betId, { optionId: refunded.options[0]! }, after(1));
  await cancelBet(ctx.owner, id, cancelled.betId, after(2));
  await settleDue(id, after(20));
  await resolveBet(ctx.owner, id, pending.betId, { optionId: pending.options[0]! }, after(21));
  return { ...ctx, p1, p2, p3, won, lost, refunded, cancelled, open, pending };
}

describe("statistiques", () => {
  beforeEach(resetDb);

  it("gagné, perdu, remboursé, annulé, ouvert, en attente : 2 paris, 1 gagné, 50 %", async () => {
    const s = await sixBets();
    const gain = (await payoutOf(s.won.betId, s.p1.id)) - 10;
    expect(gain).toBeGreaterThan(0);
    expect(await memberStats(s.league.id, s.p1.id)).toEqual({
      bets: 2,
      won: 1,
      successRate: 50,
      net: gain - 4,
    });
    // L'autre côté des deux paris réglés.
    expect(await memberStats(s.league.id, s.p2.id)).toEqual({
      bets: 2,
      won: 1,
      successRate: 50,
      net: -5 + ((await payoutOf(s.lost.betId, s.p2.id)) - 6),
    });
  });

  it("aucun pari : réussite vide", async () => {
    const ctx = await leagueWith(1);
    expect(await memberStats(ctx.league.id, ctx.players[0]!.id)).toEqual({
      bets: 0,
      won: 0,
      successRate: null,
      net: 0,
    });
  });

  it("un gagnant qui reçoit exactement sa mise compte comme gagné", async () => {
    const ctx = await leagueWith(3, 200);
    await getDb().update(leagues).set({ seedAmount: 0 }).where(eq(leagues.id, ctx.league.id));
    const [p1, p2, p3] = [ctx.players[0]!, ctx.players[1]!, ctx.players[2]!];
    // Pot 101 sur W 100 : p1 reçoit 1 pour 1, la clope restante va à p2.
    const bet = await betWithStakes(ctx.league.id, ctx.owner, [
      [p1, 0, 1],
      [p2, 0, 99],
      [p3, 1, 1],
    ]);
    await resolveBet(ctx.owner, ctx.league.id, bet.betId, { optionId: bet.options[0]! }, after(1));
    await settleDue(ctx.league.id, after(20));
    expect(await payoutOf(bet.betId, p1.id)).toBe(1);
    expect(await memberStats(ctx.league.id, p1.id)).toEqual({
      bets: 1,
      won: 1,
      successRate: 100,
      net: 0,
    });
  });

  it("les mises d'une autre ligue ne comptent pas", async () => {
    const s = await sixBets();
    const other = await leagueWith(1);
    expect(await memberStats(other.league.id, s.p1.id)).toEqual({
      bets: 0,
      won: 0,
      successRate: null,
      net: 0,
    });
  });
});

describe("classement", () => {
  beforeEach(resetDb);

  it("fortune et bilan net, avec leurs départages", async () => {
    const ctx = await leagueWith(3, 50, T0);
    const id = ctx.league.id;
    const [p1, p2, p3] = [ctx.players[0]!, ctx.players[1]!, ctx.players[2]!];
    await getDb().update(leagues).set({ seedAmount: 0 }).where(eq(leagues.id, id));
    // Ancienneté : owner, puis p1, p2, p3.
    for (const [i, u] of [ctx.owner, p1, p2, p3].entries()) {
      await getDb()
        .update(leagueMembers)
        .set({ joinedAt: new Date(T0.getTime() - (10 - i) * 60_000) })
        .where(and(eq(leagueMembers.leagueId, id), eq(leagueMembers.userId, u.id)));
    }
    // Sans cagnotte : p1 +10, p2 −10 ; owner et p3 à 0.
    const bet = await betWithStakes(id, ctx.owner, [
      [p1, 0, 10],
      [p2, 1, 10],
    ]);
    await resolveBet(ctx.owner, id, bet.betId, { optionId: bet.options[0]! }, after(1));
    await settleDue(id, after(20));

    // Fortune : tous à 40, le bilan départage, puis l'ancienneté (owner avant p3).
    for (const u of [ctx.owner, p1, p2, p3]) await setBalance(id, u.id, 40);
    expect((await leagueRanking(id, "fortune")).map((r) => [r.userId, r.rank])).toEqual([
      [p1.id, 1],
      [ctx.owner.id, 2],
      [p3.id, 3],
      [p2.id, 4],
    ]);

    // Bilan net : le bilan, puis le solde (p3 devant l'owner), malgré la fortune de p2.
    await setBalance(id, p2.id, 500);
    await setBalance(id, p3.id, 41);
    expect((await leagueRanking(id, "net")).map((r) => [r.userId, r.stats.net])).toEqual([
      [p1.id, 10],
      [p3.id, 0],
      [ctx.owner.id, 0],
      [p2.id, -10],
    ]);
    expect((await leagueRanking(id, "fortune"))[0]!.userId).toBe(p2.id);
  });

  it("membre parti ou supprimé absent", async () => {
    const ctx = await leagueWith(3);
    const [p1, p2] = [ctx.players[0]!, ctx.players[1]!];
    await leaveLeague(p1, ctx.league.id, new Date());
    await deleteAccount({ id: p2.id, username: p2.name!, email: p2.email }, p2.name, new Date());
    const ids = (await leagueRanking(ctx.league.id, "fortune")).map((r) => r.userId);
    expect(ids).toHaveLength(2);
    expect(ids).not.toContain(p1.id);
    expect(ids).not.toContain(p2.id);
  });

  it("carte : écart, premier, paris ouverts, seul", async () => {
    const ctx = await leagueWith(2);
    const [p1, p2] = [ctx.players[0]!, ctx.players[1]!];
    const id = ctx.league.id;
    await setBalance(id, ctx.owner.id, 150);
    await setBalance(id, p1.id, 85);
    await setBalance(id, p2.id, 64);
    await createBet(
      ctx.owner,
      id,
      {
        question: "Qui paie ?",
        options: ["A", "B"],
        moment: "NIGHT",
        closesAt: CLOSE.toISOString(),
      },
      T0,
    );
    const view = await getRanking(p2, id, "fortune", at(5));
    expect(view.card).toEqual({ kind: "behind", gap: 21, rival: p1.name, openBets: 1 });
    expect((await getRanking(ctx.owner, id, "fortune", after(1))).card).toEqual({
      kind: "leader",
      lead: 65,
      rival: p1.name,
      openBets: 0,
    });
    expect((await getRanking(p2, id, "net", at(5))).card).toBeNull();

    const alone = await leagueWith(0);
    expect((await getRanking(alone.owner, alone.league.id, "fortune", at(5))).card).toEqual({
      kind: "alone",
    });
  });

  it("paris ouverts : ni programmés, ni fermés, ni annulés", async () => {
    const ctx = await leagueWith(1);
    const id = ctx.league.id;
    const mk = (opensAt: Date | undefined) =>
      createBet(
        ctx.owner,
        id,
        {
          question: "Qui ?",
          options: ["A", "B"],
          moment: "NIGHT",
          closesAt: CLOSE.toISOString(),
          ...(opensAt ? { opensAt: opensAt.toISOString() } : {}),
        },
        T0,
      );
    await mk(undefined);
    await mk(undefined);
    await mk(at(60));
    const cancelled = await mk(undefined);
    if (!cancelled.ok) throw new Error("pari");
    await cancelBet(ctx.owner, id, cancelled.betId, at(2));
    expect(await countOpenBets(id, at(5))).toBe(2);
    expect(await countOpenBets(id, at(65))).toBe(3);
    expect(await countOpenBets(id, CLOSE)).toBe(0);
  });

  it("non-membre : 404", async () => {
    const ctx = await leagueWith(1);
    const other = await leagueWith(0);
    await expect(getRanking(other.owner, ctx.league.id, "fortune", T0)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("cohérence", () => {
  beforeEach(resetDb);

  it("la somme des bilans, partis compris, égale la somme des cagnottes versées", async () => {
    const s = await sixBets();
    await settleDue(s.league.id, after(60));
    await leaveLeague(s.p2, s.league.id, after(61));
    const stats = await leagueStats(s.league.id);
    const totalNet = [...stats.values()].reduce((acc, st) => acc + st.net, 0);
    const [seeds] = await getDb()
      .select({ total: sum(bets.seed).mapWith(Number) })
      .from(bets)
      .where(and(eq(bets.leagueId, s.league.id), isNotNull(bets.settledAt)));
    expect(seeds!.total).toBeGreaterThan(0);
    expect(totalNet).toBe(seeds!.total);
    expect(stats.has(s.p2.id)).toBe(true);
  });
});

describe("prochain changement du classement", () => {
  beforeEach(resetDb);

  it("versement dû, ouverture ou fermeture la plus proche", async () => {
    const ctx = await leagueWith(2);
    const [p1, p2] = [ctx.players[0]!, ctx.players[1]!];
    const id = ctx.league.id;
    expect(await nextRankingChange(id, T0)).toBeNull();

    const bet = await betWithStakes(id, ctx.owner, [
      [p1, 0, 2],
      [p2, 1, 2],
    ]);
    // Ouvert : sa fermeture.
    expect(await nextRankingChange(id, at(5))).toEqual(CLOSE);
    await createBet(
      ctx.owner,
      id,
      {
        question: "Plus tard ?",
        options: ["A", "B"],
        moment: "NIGHT",
        opensAt: at(60).toISOString(),
        closesAt: after(300).toISOString(),
      },
      T0,
    );
    // Programmé : son ouverture vient avant.
    expect(await nextRankingChange(id, at(5))).toEqual(at(60));
    // Saisi : le versement, 10 minutes après.
    await resolveBet(ctx.owner, id, bet.betId, { optionId: bet.options[0]! }, after(1));
    expect(await nextRankingChange(id, after(2))).toEqual(after(11));
    await settleDue(id, after(12));
    expect(await nextRankingChange(id, after(12))).toEqual(after(300));
  });
});
