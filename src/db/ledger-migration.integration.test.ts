import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { resetDb } from "@/test/db";
import { createUser } from "@/test/factories";
import { ledger, leagueMembers, leagues } from "./schema";

/** Rattrapage de la migration 0002 : la dotation des membres arrivés avant M2. */
function backfillStatements(): string[] {
  const migration = readFileSync("src/db/migrations/0002_ledger.sql", "utf8");
  const part = migration.slice(migration.indexOf("-- Dotation de départ"));
  return part
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function leagueWith(joinGrant: number, members: number) {
  const owner = await createUser();
  const [league] = await getDb()
    .insert(leagues)
    .values({
      name: `Ligue ${joinGrant}`,
      inviteCode: `CODE${joinGrant}`.slice(0, 6),
      ownerId: owner.id,
      joinGrant,
    })
    .returning();
  await getDb()
    .insert(leagueMembers)
    .values({ leagueId: league!.id, userId: owner.id, role: "owner" });
  for (let i = 1; i < members; i++) {
    const u = await createUser();
    await getDb().insert(leagueMembers).values({ leagueId: league!.id, userId: u.id });
  }
  return league!;
}

describe("migration du journal", () => {
  beforeEach(resetDb);

  it("verse la dotation aux membres d'avant M2, sauf à 0, une seule fois", async () => {
    const paid = await leagueWith(50, 3);
    const free = await leagueWith(0, 2);
    for (const statement of backfillStatements()) await getDb().execute(sql.raw(statement));
    // Rejouée, elle ne paie pas deux fois.
    await getDb().execute(sql.raw(backfillStatements()[0]!));

    const rows = await getDb()
      .select()
      .from(leagueMembers)
      .where(eq(leagueMembers.leagueId, paid.id));
    expect(rows.map((r) => r.balance)).toEqual([50, 50, 50]);
    expect(await getDb().select().from(ledger).where(eq(ledger.leagueId, paid.id))).toHaveLength(3);
    expect(await getDb().select().from(ledger).where(eq(ledger.leagueId, free.id))).toHaveLength(0);
  });

  it("une ligne ne se modifie pas et ne se supprime qu'avec sa ligue", async () => {
    const league = await leagueWith(50, 1);
    for (const statement of backfillStatements()) await getDb().execute(sql.raw(statement));
    await expect(getDb().update(ledger).set({ delta: 1000 })).rejects.toThrow();
    await expect(getDb().delete(ledger)).rejects.toThrow();
    await getDb().delete(leagues).where(eq(leagues.id, league.id));
    expect(await getDb().select().from(ledger)).toHaveLength(0);
  });
});
