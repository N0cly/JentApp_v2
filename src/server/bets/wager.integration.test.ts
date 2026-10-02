import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { ledger, leagueMembers, wagers } from "@/db/schema";
import { findDiscrepancies } from "@/server/ledger";
import { leagueWith, optionIds } from "@/test/bets";
import { resetDb } from "@/test/db";
import { createBet } from "./manage";
import { placeWager } from "./wager";

const now = new Date("2026-10-07T18:00:00Z");
const closesAt = new Date(now.getTime() + 2 * 3600_000);

async function setup(players = 2, grant = 50) {
  const ctx = await leagueWith(players, grant, now);
  const created = await createBet(
    ctx.owner,
    ctx.league.id,
    {
      question: "Qui paie la tournée ?",
      options: ["A", "B"],
      moment: "NIGHT",
      closesAt: closesAt.toISOString(),
    },
    now,
  );
  if (!created.ok) throw new Error(JSON.stringify(created));
  const [a, b] = await optionIds(created.betId);
  return { ...ctx, betId: created.betId, a: a!, b: b! };
}

const bet = (
  s: Awaited<ReturnType<typeof setup>>,
  user: { id: string },
  optionId: string,
  amount: number,
  at = now,
  ticketId = randomUUID(),
) => placeWager(user, s.league.id, s.betId, { optionId, amount, ticketId }, at);

async function balanceOf(leagueId: string, userId: string) {
  const [row] = await getDb()
    .select({ balance: leagueMembers.balance })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
  return row!.balance;
}

describe("mise", () => {
  beforeEach(resetDb);

  it("débite le solde et crée la mise ; on ajoute sur la même option", async () => {
    const s = await setup();
    const p = s.players[0]!;
    expect(await bet(s, p, s.a, 10)).toEqual({ ok: true, stake: 10, balance: 40 });
    expect(await bet(s, p, s.a, 5)).toEqual({ ok: true, stake: 15, balance: 35 });
    const rows = await getDb()
      .select()
      .from(ledger)
      .where(and(eq(ledger.userId, p.id), eq(ledger.reason, "wager")));
    expect(rows.map((r) => [r.delta, r.refId])).toEqual([
      [-10, s.betId],
      [-5, s.betId],
    ]);
  });

  it("à closes_at pile : refusée", async () => {
    const s = await setup();
    expect(await bet(s, s.players[0]!, s.a, 5, closesAt)).toEqual({
      ok: false,
      error: "Trop tard, le pari vient de fermer.",
    });
    expect(await getDb().select().from(wagers)).toHaveLength(0);
  });

  it("au-delà du solde : refusée, rien d'écrit", async () => {
    const s = await setup();
    expect(await bet(s, s.players[0]!, s.a, 56)).toEqual({
      ok: false,
      error: "Il te manque 6 clopes.",
    });
    expect(await getDb().select().from(wagers)).toHaveLength(0);
    expect(await getDb().select().from(ledger).where(eq(ledger.reason, "wager"))).toHaveLength(0);
    expect(await balanceOf(s.league.id, s.players[0]!.id)).toBe(50);
  });

  it("deux mises simultanées qui dépassent le solde à elles deux : une seule passe", async () => {
    const s = await setup();
    const p = s.players[0]!;
    const results = await Promise.all([bet(s, p, s.a, 30), bet(s, p, s.a, 30)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: "Il te manque 10 clopes." });
    expect(await balanceOf(s.league.id, p.id)).toBe(20);
    expect(await findDiscrepancies(getDb())).toEqual([]);
  });

  it("double envoi du même ticket : une seule mise", async () => {
    const s = await setup();
    const p = s.players[0]!;
    const ticket = randomUUID();
    await Promise.all(Array.from({ length: 5 }, () => bet(s, p, s.a, 10, now, ticket)));
    const [row] = await getDb().select().from(wagers);
    expect(row?.amount).toBe(10);
    expect(await balanceOf(s.league.id, p.id)).toBe(40);
  });

  it("changer d'option : refusé", async () => {
    const s = await setup();
    const p = s.players[0]!;
    await bet(s, p, s.a, 5);
    expect(await bet(s, p, s.b, 5)).toEqual({
      ok: false,
      error: "Tu as déjà misé sur une autre option.",
    });
  });

  it("pas avant l'ouverture, pas de montant invalide", async () => {
    const ctx = await leagueWith(1, 50, now);
    const created = await createBet(
      ctx.owner,
      ctx.league.id,
      {
        question: "Plus tard ?",
        options: ["A", "B"],
        moment: "DAILY",
        opensAt: new Date(now.getTime() + 3600_000).toISOString(),
        closesAt: closesAt.toISOString(),
      },
      now,
    );
    if (!created.ok) throw new Error();
    const [a] = await optionIds(created.betId);
    expect(
      await placeWager(
        ctx.players[0]!,
        ctx.league.id,
        created.betId,
        { optionId: a, amount: 5, ticketId: randomUUID() },
        now,
      ),
    ).toEqual({
      ok: false,
      error: "Ce pari n'accepte pas de mise.",
    });
    expect(
      await placeWager(
        ctx.players[0]!,
        ctx.league.id,
        created.betId,
        { optionId: a, amount: 0, ticketId: randomUUID() },
        now,
      ),
    ).toMatchObject({ ok: false });
  });

  it("le créateur mise comme les autres", async () => {
    const s = await setup();
    expect((await bet(s, s.owner, s.b, 5)).ok).toBe(true);
  });
});
