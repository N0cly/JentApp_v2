import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { auditLog, bets, leagues } from "@/db/schema";
import { NotFoundError } from "@/server/errors";
import { leagueWith } from "@/test/bets";
import { at, betWithStakes, CLOSE } from "@/test/bet-scenarios";
import { resetDb } from "@/test/db";
import { correctResult, resolveBet } from "./result";

async function seedOf(betId: string) {
  const [row] = await getDb().select().from(bets).where(eq(bets.id, betId));
  return row!;
}

const after = (minutes: number) => new Date(CLOSE.getTime() + minutes * 60_000);

describe("résultat", () => {
  beforeEach(resetDb);

  it("refusé avant la fermeture, et à un joueur qui n'est pas le créateur", async () => {
    const { league, owner, players } = await leagueWith(3);
    const { betId, options } = await betWithStakes(league.id, owner, [
      [players[0]!, 0, 5],
      [players[1]!, 1, 5],
    ]);
    expect(await resolveBet(owner, league.id, betId, { optionId: options[0]! }, at(60))).toEqual({
      ok: false,
      error: "Le résultat se saisit une fois le pari fermé.",
    });
    await expect(
      resolveBet(players[0]!, league.id, betId, { optionId: options[0]! }, after(1)),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await resolveBet(owner, league.id, betId, { optionId: options[0]! }, after(1))).toEqual({
      ok: true,
    });
    const bet = await seedOf(betId);
    expect(bet).toMatchObject({
      winningOptionId: options[0],
      resolvedAt: after(1),
      resolvedBy: owner.id,
    });
    const entries = await getDb()
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "bet.resolved"));
    expect(entries.map((e) => e.details)).toEqual([{ betId, optionId: options[0] }]);
  });

  it("la correction relance le délai ; refusée après le délai", async () => {
    const { league, owner, players } = await leagueWith(2);
    const { betId, options } = await betWithStakes(league.id, owner, [
      [players[0]!, 0, 5],
      [players[1]!, 1, 5],
    ]);
    await resolveBet(owner, league.id, betId, { optionId: options[0]! }, after(1));
    expect(
      await correctResult(owner, league.id, betId, { optionId: options[1]! }, after(6)),
    ).toEqual({ ok: true });
    expect(await seedOf(betId)).toMatchObject({
      winningOptionId: options[1],
      resolvedAt: after(6),
    });
    // Délai de 10 minutes à partir de la correction.
    expect(
      (await correctResult(owner, league.id, betId, { optionId: options[0]! }, after(15))).ok,
    ).toBe(true);
    expect(
      await correctResult(owner, league.id, betId, { optionId: options[1]! }, after(25)),
    ).toEqual({
      ok: false,
      error: "Trop tard, les gains sont versés.",
    });
    expect(
      (await getDb().select().from(auditLog).where(eq(auditLog.action, "bet.corrected"))).length,
    ).toBe(2);
  });

  it("égalité : celui qui saisit annule et rend les mises", async () => {
    const { league, players } = await leagueWith(2);
    const { betId } = await betWithStakes(league.id, players[0]!, [
      [players[0]!, 0, 5],
      [players[1]!, 1, 5],
    ]);
    expect(await resolveBet(players[0]!, league.id, betId, { cancel: true }, after(1))).toEqual({
      ok: true,
    });
    expect(await seedOf(betId)).toMatchObject({ cancelReason: "tie", cancelledBy: players[0]!.id });
  });
});

describe("cagnotte", () => {
  beforeEach(resetDb);

  it("versée avec 3 joueurs sur 2 options et quelqu'un sur la gagnante", async () => {
    const { league, owner, players } = await leagueWith(3);
    const { betId, options } = await betWithStakes(league.id, owner, [
      [players[0]!, 0, 5],
      [players[1]!, 0, 3],
      [players[2]!, 1, 4],
    ]);
    await resolveBet(owner, league.id, betId, { optionId: options[0]! }, after(1));
    expect((await seedOf(betId)).seed).toBe(5);
    // Correction vers une option sans mise : la cagnotte tombe.
    await correctResult(owner, league.id, betId, { optionId: options[2]! }, after(2));
    expect((await seedOf(betId)).seed).toBe(0);
  });

  it("2 joueurs : non. 3 joueurs sur une seule option : non. Réglage à 0 : non", async () => {
    const { league, owner, players } = await leagueWith(3);
    const two = await betWithStakes(league.id, owner, [
      [players[0]!, 0, 5],
      [players[1]!, 1, 5],
    ]);
    await resolveBet(owner, league.id, two.betId, { optionId: two.options[0]! }, after(1));
    expect((await seedOf(two.betId)).seed).toBe(0);

    const one = await betWithStakes(league.id, owner, [
      [players[0]!, 0, 1],
      [players[1]!, 0, 1],
      [players[2]!, 0, 1],
    ]);
    await resolveBet(owner, league.id, one.betId, { optionId: one.options[0]! }, after(1));
    expect((await seedOf(one.betId)).seed).toBe(0);

    await getDb().update(leagues).set({ seedAmount: 0 }).where(eq(leagues.id, league.id));
    const off = await betWithStakes(league.id, owner, [
      [players[0]!, 0, 1],
      [players[1]!, 0, 1],
      [players[2]!, 1, 1],
    ]);
    await resolveBet(owner, league.id, off.betId, { optionId: off.options[0]! }, after(1));
    expect((await seedOf(off.betId)).seed).toBe(0);
  });

  it("sixième pari de la semaine : non ; deux saisies simultanées au cinquième : une seule cagnotte", async () => {
    const { league, owner, players } = await leagueWith(3, 200);
    const make = () =>
      betWithStakes(league.id, owner, [
        [players[0]!, 0, 1],
        [players[1]!, 0, 1],
        [players[2]!, 1, 1],
      ]);
    for (let i = 0; i < 4; i++) {
      const b = await make();
      await resolveBet(owner, league.id, b.betId, { optionId: b.options[0]! }, after(1));
      expect((await seedOf(b.betId)).seed).toBe(5);
    }
    const fifth = await make();
    const sixth = await make();
    await Promise.all([
      resolveBet(owner, league.id, fifth.betId, { optionId: fifth.options[0]! }, after(1)),
      resolveBet(owner, league.id, sixth.betId, { optionId: sixth.options[0]! }, after(1)),
    ]);
    const seeds = [(await seedOf(fifth.betId)).seed, (await seedOf(sixth.betId)).seed].sort();
    expect(seeds).toEqual([0, 5]);
  });
});
