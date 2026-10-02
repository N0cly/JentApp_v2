import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { ledger, leagueMembers, leagues } from "@/db/schema";
import { findDiscrepancies } from "@/server/ledger";
import { resetDb } from "@/test/db";
import { createUser } from "@/test/factories";
import { createLeague, joinLeague, leaveLeague, removeMember } from "./leagues";

async function newLeague(ownerId: string, joinGrant = 50) {
  const result = await createLeague(
    { id: ownerId },
    { name: "Coloc", joinGrant, weeklyGrant: 10, seedAmount: 5 },
    new Date(),
  );
  if (!result.ok) throw new Error("ligue");
  const [league] = await getDb().select().from(leagues).where(eq(leagues.id, result.leagueId));
  return league!;
}

async function balanceOf(leagueId: string, userId: string) {
  const [row] = await getDb()
    .select({ balance: leagueMembers.balance })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
  return row?.balance;
}

async function grants(leagueId: string, userId: string) {
  return getDb()
    .select()
    .from(ledger)
    .where(
      and(
        eq(ledger.leagueId, leagueId),
        eq(ledger.userId, userId),
        eq(ledger.reason, "join_grant"),
      ),
    );
}

describe("dotation de départ", () => {
  beforeEach(resetDb);

  it("versée au créateur et à chaque arrivant, avec sa clé", async () => {
    const a = await createUser();
    const b = await createUser();
    const league = await newLeague(a.id, 50);
    await joinLeague({ id: b.id }, league.inviteCode, new Date());
    expect(await balanceOf(league.id, a.id)).toBe(50);
    expect(await balanceOf(league.id, b.id)).toBe(50);
    expect((await grants(league.id, b.id))[0]?.uniqueKey).toBe(`join:${league.id}:${b.id}`);
    expect(await findDiscrepancies(getDb())).toEqual([]);
  });

  it("au montant de l'instant", async () => {
    const a = await createUser();
    const b = await createUser();
    const league = await newLeague(a.id, 50);
    await getDb().update(leagues).set({ joinGrant: 120 }).where(eq(leagues.id, league.id));
    await joinLeague({ id: b.id }, league.inviteCode, new Date());
    expect(await balanceOf(league.id, a.id)).toBe(50);
    expect(await balanceOf(league.id, b.id)).toBe(120);
  });

  it("à 0, aucune ligne", async () => {
    const a = await createUser();
    const league = await newLeague(a.id, 0);
    expect(await balanceOf(league.id, a.id)).toBe(0);
    expect(await grants(league.id, a.id)).toHaveLength(0);
  });

  it("jamais au retour d'un ancien membre, qu'il soit parti ou exclu", async () => {
    const a = await createUser();
    const b = await createUser();
    const c = await createUser();
    const league = await newLeague(a.id, 50);
    await joinLeague({ id: b.id }, league.inviteCode, new Date());
    await joinLeague({ id: c.id }, league.inviteCode, new Date());
    await leaveLeague({ id: b.id }, league.id, new Date());
    await removeMember({ id: a.id }, league.id, c.id, new Date());
    await joinLeague({ id: b.id }, league.inviteCode, new Date());
    await joinLeague({ id: c.id }, league.inviteCode, new Date());
    expect(await balanceOf(league.id, b.id)).toBe(50);
    expect(await grants(league.id, b.id)).toHaveLength(1);
    expect(await grants(league.id, c.id)).toHaveLength(1);
  });

  it("règle 4 : dix arrivées simultanées du même compte, une seule dotation", async () => {
    const a = await createUser();
    const b = await createUser();
    const league = await newLeague(a.id, 50);
    await Promise.all(
      Array.from({ length: 10 }, () => joinLeague({ id: b.id }, league.inviteCode, new Date())),
    );
    expect(await grants(league.id, b.id)).toHaveLength(1);
    expect(await balanceOf(league.id, b.id)).toBe(50);
  });
});
