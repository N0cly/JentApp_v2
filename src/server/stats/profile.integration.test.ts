import { beforeEach, describe, expect, it } from "vitest";
import { createBet, placeWager, resolveBet, settleDue } from "@/server/bets";
import { leaveLeague } from "@/server/leagues";
import { at, betWithStakes, CLOSE, T0 } from "@/test/bet-scenarios";
import { leagueWith, optionIds } from "@/test/bets";
import { resetDb } from "@/test/db";
import { randomUUID } from "node:crypto";
import { getProfile, PROFILE_RECENT } from "./profile";
import { getRanking } from "./ranking";

const after = (minutes: number) => new Date(CLOSE.getTime() + minutes * 60_000);

async function settledTrio(
  ctx: Awaited<ReturnType<typeof leagueWith>>,
  winner: number,
  minute: number,
) {
  const [p1, p2, p3] = [ctx.players[0]!, ctx.players[1]!, ctx.players[2]!];
  const bet = await betWithStakes(ctx.league.id, ctx.owner, [
    [p1, 0, 2],
    [p2, 1, 2],
    [p3, 1, 1],
  ]);
  await resolveBet(
    ctx.owner,
    ctx.league.id,
    bet.betId,
    { optionId: bet.options[winner]! },
    after(minute),
  );
  await settleDue(ctx.league.id, after(minute + 11));
  return bet;
}

describe("profil", () => {
  beforeEach(resetDb);

  it("non-membre, cible hors de la ligue ou partie : 404", async () => {
    const ctx = await leagueWith(2);
    const [p1, p2] = [ctx.players[0]!, ctx.players[1]!];
    const outsider = await leagueWith(0);
    const id = ctx.league.id;
    const notFound = { status: 404 };

    await expect(getProfile(outsider.owner, id, p1.id, T0)).rejects.toMatchObject(notFound);
    await expect(getProfile(p1, id, outsider.owner.id, T0)).rejects.toMatchObject(notFound);
    await expect(getProfile(p1, id, "pas-un-uuid", T0)).rejects.toMatchObject(notFound);
    await leaveLeague(p2, id, T0);
    await expect(getProfile(p1, id, p2.id, T0)).rejects.toMatchObject(notFound);
    // Parti, il ne lit plus les autres non plus.
    await expect(getProfile(p2, id, p1.id, T0)).rejects.toMatchObject(notFound);
  });

  it("pseudo, avatar, rôle et chiffres ; aucun email", async () => {
    const ctx = await leagueWith(3);
    const p1 = ctx.players[0]!;
    await settledTrio(ctx, 0, 1);
    const profile = await getProfile(ctx.players[1]!, ctx.league.id, p1.id, after(30));
    expect(Object.keys(profile).sort()).toEqual(
      [
        "userId",
        "username",
        "image",
        "role",
        "rank",
        "balance",
        "stats",
        "recent",
        "canManage",
      ].sort(),
    );
    expect(profile).toMatchObject({ username: p1.name, role: "player", canManage: false });
    const json = JSON.stringify(profile);
    for (const u of [ctx.owner, ...ctx.players]) expect(json).not.toContain(u.email);
    expect(json).not.toContain("@");
  });

  it("« Gérer ce membre » pour l'owner seulement", async () => {
    const ctx = await leagueWith(2);
    const [p1, p2] = [ctx.players[0]!, ctx.players[1]!];
    expect((await getProfile(ctx.owner, ctx.league.id, p1.id, T0)).canManage).toBe(true);
    expect((await getProfile(p2, ctx.league.id, p1.id, T0)).canManage).toBe(false);
  });

  it("une mise sur un pari non réglé n'apparaît ni dans la liste ni dans les chiffres", async () => {
    const ctx = await leagueWith(3);
    const [p1, p2] = [ctx.players[0]!, ctx.players[1]!];
    const id = ctx.league.id;
    const done = await settledTrio(ctx, 0, 1);
    // Un pari ouvert et un pari saisi, en attente de versement.
    const created = await createBet(
      ctx.owner,
      id,
      {
        question: "Encore ouvert ?",
        options: ["A", "B"],
        moment: "NIGHT",
        closesAt: after(500).toISOString(),
      },
      T0,
    );
    if (!created.ok) throw new Error("pari");
    const [a] = await optionIds(created.betId);
    await placeWager(
      p1,
      id,
      created.betId,
      { optionId: a!, amount: 7, ticketId: randomUUID() },
      at(1),
    );
    const pending = await betWithStakes(id, ctx.owner, [
      [p1, 0, 3],
      [p2, 1, 3],
    ]);
    await resolveBet(ctx.owner, id, pending.betId, { optionId: pending.options[0]! }, after(20));

    const profile = await getProfile(p2, id, p1.id, after(22));
    expect(profile.recent.map((r) => r.betId)).toEqual([done.betId]);
    expect(profile.stats).toMatchObject({ bets: 1, won: 1 });
    const json = JSON.stringify(profile);
    expect(json).not.toContain(created.betId);
    expect(json).not.toContain(pending.betId);
    expect(json).not.toContain("Encore ouvert");
  });

  it("5 derniers paris réglés, du plus récent au plus ancien", async () => {
    const ctx = await leagueWith(3);
    const ids = [];
    for (let i = 0; i < PROFILE_RECENT + 1; i++)
      ids.push((await settledTrio(ctx, i % 2, i * 20)).betId);
    const profile = await getProfile(ctx.owner, ctx.league.id, ctx.players[0]!.id, after(200));
    expect(profile.recent.map((r) => r.betId)).toEqual(ids.reverse().slice(0, PROFILE_RECENT));
    expect(profile.recent.map((r) => r.outcome.kind)).toEqual([
      "lost",
      "won",
      "lost",
      "won",
      "lost",
    ]);
  });

  it("même rang, même solde, même bilan dans le classement, sur Moi et sur le profil", async () => {
    const ctx = await leagueWith(3);
    await settledTrio(ctx, 0, 1);
    await settledTrio(ctx, 1, 20);
    const id = ctx.league.id;
    const now = after(60);
    const { rows } = await getRanking(ctx.owner, id, "fortune", now);
    for (const row of rows) {
      const viewer = rows.find((r) => r.userId !== row.userId)!;
      const seen = await getProfile({ id: viewer.userId }, id, row.userId, now);
      // Moi lit le même profil, sur soi.
      const mine = await getProfile({ id: row.userId }, id, row.userId, now);
      for (const view of [seen, mine]) {
        expect(view.rank).toBe(row.rank);
        expect(view.balance).toBe(row.balance);
        expect(view.stats).toEqual(row.stats);
      }
    }
  });
});
