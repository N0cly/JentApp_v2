import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { ledger, leagueMembers, leagues } from "@/db/schema";
import { resetDb } from "@/test/db";
import { createUser } from "@/test/factories";
import { createLeague, joinLeague } from "./leagues";
import { grantWeekly } from "./weekly-grant";

// Mercredi 7 octobre 2026, midi à Paris ; les semaines suivantes.
const arrival = new Date("2026-10-07T10:00:00Z");
const sameWeekSunday = new Date("2026-10-11T21:00:00Z");
const nextMonday = new Date("2026-10-11T22:00:00Z"); // lundi 12, 00:00 à Paris (UTC+2)
const nextWeek = new Date("2026-10-14T10:00:00Z");
const threeWeeksLater = new Date("2026-10-28T10:00:00Z");

async function setup(weeklyGrant = 10) {
  const owner = await createUser();
  const player = await createUser();
  const result = await createLeague(
    { id: owner.id },
    { name: "Coloc", joinGrant: 50, weeklyGrant, seedAmount: 5 },
    arrival,
  );
  if (!result.ok) throw new Error("ligue");
  const [league] = await getDb().select().from(leagues).where(eq(leagues.id, result.leagueId));
  await joinLeague({ id: player.id }, league!.inviteCode, arrival);
  return { leagueId: league!.id, userId: player.id };
}

async function weekly(leagueId: string, userId: string) {
  return getDb()
    .select()
    .from(ledger)
    .where(
      and(
        eq(ledger.leagueId, leagueId),
        eq(ledger.userId, userId),
        eq(ledger.reason, "weekly_grant"),
      ),
    );
}

async function balanceOf(leagueId: string, userId: string) {
  const [row] = await getDb()
    .select({ balance: leagueMembers.balance })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
  return row!.balance;
}

describe("allocation hebdomadaire", () => {
  beforeEach(resetDb);

  it("rien la semaine d'arrivée, versée la suivante, une fois", async () => {
    const m = await setup();
    expect(await grantWeekly(m.userId, m.leagueId, arrival)).toBe(false);
    expect(await grantWeekly(m.userId, m.leagueId, sameWeekSunday)).toBe(false);
    expect(await grantWeekly(m.userId, m.leagueId, nextMonday)).toBe(true);
    expect(await grantWeekly(m.userId, m.leagueId, nextWeek)).toBe(false);
    const rows = await weekly(m.leagueId, m.userId);
    expect(rows.map((r) => [r.delta, r.uniqueKey])).toEqual([
      [10, `week:${m.leagueId}:${m.userId}:2026-10-12`],
    ]);
    expect(await balanceOf(m.leagueId, m.userId)).toBe(60);
  });

  it("règle 4 : dix visites simultanées, une seule ligne", async () => {
    const m = await setup();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => grantWeekly(m.userId, m.leagueId, nextWeek)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await weekly(m.leagueId, m.userId)).toHaveLength(1);
  });

  it("pas de rattrapage des semaines d'absence", async () => {
    const m = await setup();
    await grantWeekly(m.userId, m.leagueId, threeWeeksLater);
    expect(await weekly(m.leagueId, m.userId)).toHaveLength(1);
    expect(await balanceOf(m.leagueId, m.userId)).toBe(60);
  });

  it("à 0, rien n'est écrit ; le montant est celui de l'instant", async () => {
    const m = await setup(0);
    expect(await grantWeekly(m.userId, m.leagueId, nextWeek)).toBe(false);
    expect(await weekly(m.leagueId, m.userId)).toHaveLength(0);
    await getDb().update(leagues).set({ weeklyGrant: 25 }).where(eq(leagues.id, m.leagueId));
    await grantWeekly(m.userId, m.leagueId, threeWeeksLater);
    expect((await weekly(m.leagueId, m.userId)).map((r) => r.delta)).toEqual([25]);
  });

  it("un membre parti ne reçoit rien", async () => {
    const m = await setup();
    await getDb()
      .update(leagueMembers)
      .set({ leftAt: arrival })
      .where(and(eq(leagueMembers.leagueId, m.leagueId), eq(leagueMembers.userId, m.userId)));
    expect(await grantWeekly(m.userId, m.leagueId, nextWeek)).toBe(false);
  });
});
