import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { checkHealth } from "@/server/health";
import { resetDb } from "@/test/db";
import { appMeta, leagueMembers, leagues, users } from "./schema";

const KEY = "integration-test";

async function createUser(name: string) {
  const [user] = await getDb()
    .insert(users)
    .values({ name, email: `${name.toLowerCase()}@exemple.fr` })
    .returning();
  return user!;
}

describe("base Postgres", () => {
  beforeEach(resetDb);

  it("applique les migrations et lit ce qu'elle écrit", async () => {
    const db = getDb();
    await db
      .insert(appMeta)
      .values({ key: KEY, value: "1" })
      .onConflictDoUpdate({ target: appMeta.key, set: { value: "1" } });
    const rows = await db.select().from(appMeta).where(eq(appMeta.key, KEY));
    expect(rows).toEqual([{ key: KEY, value: "1" }]);
  });

  it("rend la santé ok", async () => {
    const health = await checkHealth();
    expect(health.body).toEqual({ status: "ok", db: "ok" });
  });

  it("refuse deux pseudos qui ne diffèrent que par la casse", async () => {
    await createUser("Nocly");
    await expect(
      getDb().insert(users).values({ name: "nocly", email: "autre@exemple.fr" }),
    ).rejects.toThrow();
  });

  it("refuse un second owner actif et un solde négatif", async () => {
    const a = await createUser("Alpha");
    const b = await createUser("Bravo");
    const db = getDb();
    const [league] = await db
      .insert(leagues)
      .values({ name: "Coloc", inviteCode: "ABCDEF", ownerId: a.id })
      .returning();
    await db.insert(leagueMembers).values({ leagueId: league!.id, userId: a.id, role: "owner" });

    await expect(
      db.insert(leagueMembers).values({ leagueId: league!.id, userId: b.id, role: "owner" }),
    ).rejects.toThrow();
    await expect(
      db.insert(leagueMembers).values({ leagueId: league!.id, userId: b.id, balance: -1 }),
    ).rejects.toThrow();
  });
});
