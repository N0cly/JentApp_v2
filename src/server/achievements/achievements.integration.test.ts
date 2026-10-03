import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { achievements, cosmetics, leagueMembers, ledger, memberAchievements } from "@/db/schema";
import { cancelBet, createBet, placeWager, resolveBet, settleDue } from "@/server/bets";
import { leaveLeague } from "@/server/leagues";
import { findDiscrepancies } from "@/server/ledger";
import { purchase } from "@/server/shop";
import { at, betWithStakes, CLOSE, T0 } from "@/test/bet-scenarios";
import { leagueWith, optionIds } from "@/test/bets";
import { enableAchievements, resetDb } from "@/test/db";
import { evaluateAchievements } from "./evaluate";
import { myAchievements } from "./read";
import type { RuleType } from "./rules";

type Ctx = Awaited<ReturnType<typeof leagueWith>>;
const after = (minutes: number) => new Date(CLOSE.getTime() + minutes * 60_000);

/** Un seul succès actif, de la règle et du seuil donnés. */
async function only(ruleType: RuleType, ruleValue: number | null, reward = 7, hidden = false) {
  await getDb().update(achievements).set({ active: false });
  const [row] = await getDb()
    .insert(achievements)
    .values({
      key: `test_${ruleType}`,
      name: `Test ${ruleType}`,
      ruleType,
      ruleValue,
      reward,
      hidden,
    })
    .returning();
  return row!;
}

async function unlockedKeys(leagueId: string, userId: string) {
  const rows = await getDb()
    .select({ key: achievements.key })
    .from(memberAchievements)
    .innerJoin(achievements, eq(achievements.id, memberAchievements.achievementId))
    .where(and(eq(memberAchievements.leagueId, leagueId), eq(memberAchievements.userId, userId)));
  return rows.map((r) => r.key);
}

async function balanceOf(leagueId: string, userId: string) {
  const [row] = await getDb()
    .select({ balance: leagueMembers.balance })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
  return row!.balance;
}

/** Pari ouvert à T0, fermant à CLOSE, et une mise. */
async function openBet(ctx: Ctx, creator = ctx.owner) {
  const created = await createBet(
    creator,
    ctx.league.id,
    { question: "Qui ?", options: ["A", "B"], moment: "NIGHT", closesAt: CLOSE.toISOString() },
    T0,
  );
  if (!created.ok) throw new Error("pari");
  return { betId: created.betId, options: await optionIds(created.betId) };
}

async function stake(
  ctx: Ctx,
  user: { id: string },
  betId: string,
  optionId: string,
  amount: number,
) {
  const result = await placeWager(
    user,
    ctx.league.id,
    betId,
    { optionId, amount, ticketId: randomUUID() },
    at(1),
  );
  if (!result.ok) throw new Error(result.error);
  return result;
}

let clock = 0;
/** Pari à trois réglé : p1 sur A (gagnant si `p1Wins`), p2 et p3 sur B. */
async function settled(ctx: Ctx, p1Wins: boolean, creator = ctx.owner, p1Amount = 2) {
  const [p1, p2, p3] = [ctx.players[0]!, ctx.players[1]!, ctx.players[2]!];
  const bet = await betWithStakes(ctx.league.id, creator, [
    [p1, 0, p1Amount],
    [p2, 1, 2],
    [p3, 1, 1],
  ]);
  clock += 20;
  await resolveBet(
    ctx.owner,
    ctx.league.id,
    bet.betId,
    { optionId: bet.options[p1Wins ? 0 : 1]! },
    after(clock),
  );
  await settleDue(ctx.league.id, after(clock + 11));
  return bet;
}

/** Pari réglé où p1 est seul : remboursé. */
async function refunded(ctx: Ctx) {
  const bet = await betWithStakes(ctx.league.id, ctx.owner, [[ctx.players[0]!, 0, 1]]);
  clock += 20;
  await resolveBet(
    ctx.owner,
    ctx.league.id,
    bet.betId,
    { optionId: bet.options[0]! },
    after(clock),
  );
  await settleDue(ctx.league.id, after(clock + 11));
}

describe("succès : chaque règle, sous le seuil puis au seuil", () => {
  beforeEach(async () => {
    await resetDb();
    clock = 0;
  });

  it("wagers_count : paris non annulés", async () => {
    await only("wagers_count", 2);
    const ctx = await leagueWith(1);
    const p = ctx.players[0]!;
    const a = await openBet(ctx);
    const cancelled = await openBet(ctx);
    await stake(ctx, p, cancelled.betId, cancelled.options[0]!, 1);
    await cancelBet(ctx.owner, ctx.league.id, cancelled.betId, at(2));
    await stake(ctx, p, a.betId, a.options[0]!, 1);
    expect(await unlockedKeys(ctx.league.id, p.id)).toEqual([]);
    const b = await openBet(ctx);
    await stake(ctx, p, b.betId, b.options[0]!, 1);
    expect(await unlockedKeys(ctx.league.id, p.id)).toEqual(["test_wagers_count"]);
  });

  it("single_stake : en une fois", async () => {
    await only("single_stake", 10);
    const ctx = await leagueWith(1);
    const p = ctx.players[0]!;
    const bet = await openBet(ctx);
    await stake(ctx, p, bet.betId, bet.options[0]!, 9);
    await stake(ctx, p, bet.betId, bet.options[0]!, 9);
    expect(await unlockedKeys(ctx.league.id, p.id)).toEqual([]);
    await stake(ctx, p, bet.betId, bet.options[0]!, 10);
    expect(await unlockedKeys(ctx.league.id, p.id)).toEqual(["test_single_stake"]);
  });

  it("all_in : tout son solde, au moins N", async () => {
    await only("all_in", 10);
    const low = await leagueWith(1, 9);
    const bet = await openBet(low);
    await stake(low, low.players[0]!, bet.betId, bet.options[0]!, 9);
    expect(await unlockedKeys(low.league.id, low.players[0]!.id)).toEqual([]);

    const ctx = await leagueWith(1, 10);
    const p = ctx.players[0]!;
    const other = await openBet(ctx);
    await stake(ctx, p, other.betId, other.options[0]!, 10);
    expect(await unlockedKeys(ctx.league.id, p.id)).toEqual(["test_all_in"]);
  });

  it("wins_count : paris gagnés au sens de M5", async () => {
    await only("wins_count", 2);
    const ctx = await leagueWith(3);
    const p = ctx.players[0]!;
    await settled(ctx, true);
    await refunded(ctx);
    expect(await unlockedKeys(ctx.league.id, p.id)).toEqual([]);
    await settled(ctx, true);
    expect(await unlockedKeys(ctx.league.id, p.id)).toEqual(["test_wins_count"]);
  });

  it("win_streak : un remboursé ne casse pas la série", async () => {
    await only("win_streak", 2);
    const ctx = await leagueWith(3);
    const p = ctx.players[0]!;
    await settled(ctx, true);
    await refunded(ctx);
    expect(await unlockedKeys(ctx.league.id, p.id)).toEqual([]);
    await settled(ctx, true);
    expect(await unlockedKeys(ctx.league.id, p.id)).toEqual(["test_win_streak"]);
  });

  it("win_streak : un perdu remet la série à zéro", async () => {
    await only("win_streak", 2);
    const ctx = await leagueWith(3);
    const p = ctx.players[0]!;
    await settled(ctx, true);
    await settled(ctx, false);
    await settled(ctx, true);
    expect(await unlockedKeys(ctx.league.id, p.id)).toEqual([]);
    expect((await myAchievements(p, ctx.league.id)).items[0]).toMatchObject({
      progress: { current: 1, target: 2 },
    });
  });

  it("broke : à sec juste après un pari perdu", async () => {
    await only("broke", null);
    const ctx = await leagueWith(3, 10);
    const p = ctx.players[0]!;
    await settled(ctx, false, ctx.owner, 4);
    expect(await unlockedKeys(ctx.league.id, p.id)).toEqual([]);
    await settled(ctx, false, ctx.owner, 6);
    expect(await balanceOf(ctx.league.id, p.id)).toBe(7);
    expect(await unlockedKeys(ctx.league.id, p.id)).toEqual(["test_broke"]);
  });

  it("bets_created : paris créés et réglés", async () => {
    await only("bets_created", 2);
    const ctx = await leagueWith(3);
    const creator = ctx.owner;
    await settled(ctx, true, creator);
    const cancelled = await openBet(ctx, creator);
    await cancelBet(creator, ctx.league.id, cancelled.betId, at(2));
    expect(await unlockedKeys(ctx.league.id, creator.id)).toEqual([]);
    await settled(ctx, false, creator);
    expect(await unlockedKeys(ctx.league.id, creator.id)).toEqual(["test_bets_created"]);
  });

  it("purchases_count : cosmétiques achetés", async () => {
    await only("purchases_count", 2);
    const ctx = await leagueWith(1, 100);
    const p = ctx.players[0]!;
    const all = await getDb().select().from(cosmetics);
    const byName = (n: string) => all.find((c) => c.name === n)!.id;
    await purchase(p, ctx.league.id, byName("Zinc"), T0);
    expect(await unlockedKeys(ctx.league.id, p.id)).toEqual([]);
    await purchase(p, ctx.league.id, byName("Carotte"), T0);
    expect(await unlockedKeys(ctx.league.id, p.id)).toEqual(["test_purchases_count"]);
  });
});

describe("déblocage", () => {
  beforeEach(async () => {
    await resetDb();
    clock = 0;
  });

  it("« Premier ticket » crédite 5 clopes, une seule fois, par le journal", async () => {
    await enableAchievements();
    const ctx = await leagueWith(1);
    const p = ctx.players[0]!;
    const bet = await openBet(ctx);
    const result = await stake(ctx, p, bet.betId, bet.options[0]!, 2);
    expect(result.balance).toBe(50 - 2 + 5);
    await stake(ctx, p, bet.betId, bet.options[0]!, 1);
    const rows = await getDb()
      .select()
      .from(ledger)
      .where(and(eq(ledger.userId, p.id), eq(ledger.reason, "achievement")));
    expect(rows.map((r) => [r.delta, r.uniqueKey])).toEqual([
      [5, `ach:${ctx.league.id}:${p.id}:first_ticket`],
    ]);
    expect(await findDiscrepancies(getDb())).toEqual([]);
  });

  it("tapis : miser tout son solde révèle le succès caché", async () => {
    await enableAchievements();
    const ctx = await leagueWith(1, 10);
    const p = ctx.players[0]!;
    const bet = await openBet(ctx);
    await stake(ctx, p, bet.betId, bet.options[0]!, 10);
    expect(await unlockedKeys(ctx.league.id, p.id)).toEqual(["first_ticket", "all_in"]);
    const mine = await myAchievements(p, ctx.league.id);
    expect(mine.items.slice(0, 2).map((i) => !i.hidden && i.name)).toEqual([
      "Premier ticket",
      "Tapis",
    ]);
    expect(await balanceOf(ctx.league.id, p.id)).toBe(15);
  });

  it("récompense nulle : débloqué sans mouvement", async () => {
    await only("wagers_count", 1, 0);
    const ctx = await leagueWith(1);
    const p = ctx.players[0]!;
    const bet = await openBet(ctx);
    await stake(ctx, p, bet.betId, bet.options[0]!, 1);
    expect(await unlockedKeys(ctx.league.id, p.id)).toEqual(["test_wagers_count"]);
    const rows = await getDb().select().from(ledger).where(eq(ledger.reason, "achievement"));
    expect(rows).toEqual([]);
  });

  it("dix évaluations simultanées : une seule récompense", async () => {
    const ctx = await leagueWith(1, 100);
    const p = ctx.players[0]!;
    const [zinc] = await getDb().select().from(cosmetics).where(eq(cosmetics.name, "Zinc"));
    await purchase(p, ctx.league.id, zinc!.id, T0);
    await only("purchases_count", 1);
    await Promise.all(
      Array.from({ length: 10 }, () =>
        getDb().transaction((tx) =>
          evaluateAchievements(tx, ctx.league.id, p.id, { kind: "purchase" }),
        ),
      ),
    );
    const rows = await getDb().select().from(ledger).where(eq(ledger.reason, "achievement"));
    expect(rows).toHaveLength(1);
    expect(await balanceOf(ctx.league.id, p.id)).toBe(100 - 20 + 7);
  });

  it("membre parti : aucun déblocage", async () => {
    const ctx = await leagueWith(1, 100);
    const p = ctx.players[0]!;
    const [zinc] = await getDb().select().from(cosmetics).where(eq(cosmetics.name, "Zinc"));
    await purchase(p, ctx.league.id, zinc!.id, T0);
    await leaveLeague(p, ctx.league.id, T0);
    await only("purchases_count", 1);
    const keys = await getDb().transaction((tx) =>
      evaluateAchievements(tx, ctx.league.id, p.id, { kind: "purchase" }),
    );
    expect(keys).toEqual([]);
  });

  it("désactivé : ne se débloque plus et n'apparaît plus, sauf chez qui l'a", async () => {
    const def = await only("wagers_count", 1);
    const ctx = await leagueWith(2);
    const [p1, p2] = [ctx.players[0]!, ctx.players[1]!];
    const bet = await openBet(ctx);
    await stake(ctx, p1, bet.betId, bet.options[0]!, 1);
    await getDb().update(achievements).set({ active: false }).where(eq(achievements.id, def.id));
    await stake(ctx, p2, bet.betId, bet.options[1]!, 1);
    expect(await unlockedKeys(ctx.league.id, p2.id)).toEqual([]);
    expect((await myAchievements(p1, ctx.league.id)).items).toHaveLength(1);
    expect((await myAchievements(p2, ctx.league.id)).items).toHaveLength(0);
  });
});

describe("succès caché", () => {
  beforeEach(resetDb);

  it("avant déblocage, ni nom, ni règle, ni récompense dans la réponse", async () => {
    await enableAchievements();
    const ctx = await leagueWith(1);
    const mine = await myAchievements(ctx.players[0]!, ctx.league.id);
    expect(mine).toMatchObject({ unlocked: 0, total: 12 });
    const hidden = mine.items.filter((i) => i.hidden);
    expect(hidden).toHaveLength(2);
    for (const item of hidden) expect(Object.keys(item).sort()).toEqual(["hidden", "id"]);
    const json = JSON.stringify(mine);
    for (const leak of ["Tapis", "À sec", "all_in", "broke", "tapis", "à sec"]) {
      expect(json).not.toContain(leak);
    }
    // Les cachés à la fin.
    expect(mine.items.slice(-2).every((i) => i.hidden)).toBe(true);
  });

  it("progression « {x} sur {n} » des règles qui comptent", async () => {
    await enableAchievements();
    const ctx = await leagueWith(1);
    const p = ctx.players[0]!;
    const bet = await openBet(ctx);
    await stake(ctx, p, bet.betId, bet.options[0]!, 1);
    const mine = await myAchievements(p, ctx.league.id);
    const regular = mine.items.find((i) => !i.hidden && i.name === "Habitué");
    expect(regular).toMatchObject({
      unlocked: false,
      description: "Miser sur 10 paris",
      progress: { current: 1, target: 10 },
    });
    const high = mine.items.find((i) => !i.hidden && i.name === "Flambeur");
    expect(high).toMatchObject({ progress: null, description: "Miser un paquet d'un coup" });
    expect(mine.items[0]).toMatchObject({ name: "Premier ticket", unlocked: true, progress: null });
  });

  it("non-membre : 404", async () => {
    const a = await leagueWith(0);
    const b = await leagueWith(0);
    await expect(myAchievements(b.owner, a.league.id)).rejects.toMatchObject({ status: 404 });
  });
});
