import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { auditLog, bets, leagueMembers } from "@/db/schema";
import { NotFoundError } from "@/server/errors";
import { findDiscrepancies } from "@/server/ledger";
import { leagueWith, makeAdmin, optionIds, rawWager } from "@/test/bets";
import { resetDb } from "@/test/db";
import { cancelBet, createBet, updateBet } from "./manage";

const now = new Date("2026-10-07T18:00:00Z");
const later = (minutes: number) => new Date(now.getTime() + minutes * 60_000);
const valid = (extra: Record<string, unknown> = {}) => ({
  question: "Qui s'endort en premier ?",
  options: ["Paco", "Mister"],
  moment: "NIGHT",
  opensAt: null,
  closesAt: later(120).toISOString(),
  ...extra,
});

async function balanceOf(leagueId: string, userId: string) {
  const [row] = await getDb()
    .select({ balance: leagueMembers.balance })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
  return row!.balance;
}

describe("création", () => {
  beforeEach(resetDb);

  it("tout membre crée un pari, ouvert maintenant par défaut, au journal de la ligue", async () => {
    const { league, players } = await leagueWith(1);
    const result = await createBet(players[0]!, league.id, valid(), now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [bet] = await getDb().select().from(bets).where(eq(bets.id, result.betId));
    expect(bet).toMatchObject({ opensAt: now, closesAt: later(120), createdBy: players[0]!.id });
    expect(await optionIds(result.betId)).toHaveLength(2);
    const [entry] = await getDb().select().from(auditLog).where(eq(auditLog.action, "bet.created"));
    expect(entry?.details).toEqual({ betId: result.betId });
  });

  it("valide avec les messages de M3", async () => {
    const { league, owner } = await leagueWith(0);
    const check = (extra: Record<string, unknown>) =>
      createBet(owner, league.id, valid(extra), now);
    expect(await check({ question: "Qui" })).toMatchObject({
      fieldErrors: { question: "Pose une question de 5 à 140 caractères." },
    });
    expect(await check({ options: ["Seul", " "] })).toMatchObject({
      fieldErrors: { options: "Il faut au moins 2 options." },
    });
    expect(await check({ options: ["Paco", "paco"] })).toMatchObject({
      fieldErrors: { options: "Deux options portent le même nom." },
    });
    expect(await check({ options: Array.from({ length: 9 }, (_, i) => `O${i}`) })).toMatchObject({
      ok: false,
    });
    expect(await check({ options: ["x".repeat(41), "b"] })).toMatchObject({ ok: false });
    expect(await check({ closesAt: later(0.5).toISOString() })).toMatchObject({
      fieldErrors: { closesAt: "La fermeture doit venir après l'ouverture." },
    });
    expect(await check({ closesAt: later(31 * 24 * 60).toISOString() })).toMatchObject({
      ok: false,
    });
    expect(await check({ hiddenUntilOpen: true })).toMatchObject({
      fieldErrors: { hiddenUntilOpen: "Un pari mystère doit s'ouvrir plus tard." },
    });
    expect((await check({ hiddenUntilOpen: true, opensAt: later(30).toISOString() })).ok).toBe(
      true,
    );
  });

  it("plafond de 3 paris en cours pour un joueur, pas pour un admin", async () => {
    const { league, owner, players } = await leagueWith(2);
    const player = players[0]!;
    const admin = players[1]!;
    await makeAdmin(league.id, owner.id, admin.id);
    for (let i = 0; i < 3; i++)
      expect((await createBet(player, league.id, valid(), now)).ok).toBe(true);
    expect(await createBet(player, league.id, valid(), now)).toEqual({
      ok: false,
      formError: "Tu as déjà 3 paris en cours. Attends que l'un d'eux soit réglé.",
    });
    for (let i = 0; i < 5; i++)
      expect((await createBet(admin, league.id, valid(), now)).ok).toBe(true);
  });

  it("un non-membre reçoit une 404", async () => {
    const { league } = await leagueWith(0);
    const other = await leagueWith(0);
    await expect(createBet(other.owner, league.id, valid(), now)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("modification", () => {
  beforeEach(resetDb);

  it("le créateur modifie tant que personne n'a misé ; refusée dès la première mise", async () => {
    const { league, owner, players } = await leagueWith(1);
    const created = await createBet(owner, league.id, valid(), now);
    if (!created.ok) throw new Error();
    expect(
      await updateBet(owner, league.id, created.betId, valid({ options: ["A", "B", "C"] }), now),
    ).toEqual({ ok: true });
    expect(await optionIds(created.betId)).toHaveLength(3);
    await expect(
      updateBet(players[0]!, league.id, created.betId, valid(), now),
    ).rejects.toBeInstanceOf(NotFoundError);

    const [first] = await optionIds(created.betId);
    await rawWager(league.id, created.betId, players[0]!.id, first!, 5);
    expect(await updateBet(owner, league.id, created.betId, valid(), now)).toEqual({
      ok: false,
      formError: "On ne modifie plus un pari dès la première mise.",
    });
  });
});

describe("annulation", () => {
  beforeEach(resetDb);

  it("rend toutes les mises et l'inscrit au journal", async () => {
    const { league, owner, players } = await leagueWith(2);
    const created = await createBet(players[0]!, league.id, valid(), now);
    if (!created.ok) throw new Error();
    const [a, b] = await optionIds(created.betId);
    await rawWager(league.id, created.betId, players[0]!.id, a!, 10);
    await rawWager(league.id, created.betId, players[1]!.id, b!, 7);
    expect(await cancelBet(players[0]!, league.id, created.betId, later(5))).toEqual({ ok: true });
    expect(await balanceOf(league.id, players[0]!.id)).toBe(50);
    expect(await balanceOf(league.id, players[1]!.id)).toBe(50);
    const [bet] = await getDb().select().from(bets).where(eq(bets.id, created.betId));
    expect(bet).toMatchObject({ cancelReason: "creator", cancelledBy: players[0]!.id });
    expect(await findDiscrepancies(getDb())).toEqual([]);
    await expect(cancelBet(owner, league.id, created.betId, later(6))).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("refusée au créateur après la fermeture ; permise à un admin, raison admin", async () => {
    const { league, owner, players } = await leagueWith(1);
    const created = await createBet(players[0]!, league.id, valid(), now);
    if (!created.ok) throw new Error();
    await expect(
      cancelBet(players[0]!, league.id, created.betId, later(121)),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await cancelBet(owner, league.id, created.betId, later(121))).toEqual({ ok: true });
    const [bet] = await getDb().select().from(bets).where(eq(bets.id, created.betId));
    expect(bet?.cancelReason).toBe("admin");
  });

  it("refusée sur un pari réglé", async () => {
    const { league, owner } = await leagueWith(0);
    const created = await createBet(owner, league.id, valid(), now);
    if (!created.ok) throw new Error();
    await getDb()
      .update(bets)
      .set({ resolvedAt: later(130), settledAt: later(141) })
      .where(eq(bets.id, created.betId));
    await expect(cancelBet(owner, league.id, created.betId, later(150))).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
