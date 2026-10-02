import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { ledger, leagueMembers, leagues } from "@/db/schema";
import { resetDb } from "@/test/db";
import { createUser } from "@/test/factories";
import { findDiscrepancies, InsufficientBalanceError, post, type Movement } from ".";

let codes = 0;

async function member() {
  const user = await createUser();
  codes += 1;
  const [league] = await getDb()
    .insert(leagues)
    .values({ name: "Ligue", inviteCode: `L${String(codes).padStart(5, "0")}`, ownerId: user.id })
    .returning();
  await getDb()
    .insert(leagueMembers)
    .values({ leagueId: league!.id, userId: user.id, role: "owner" });
  return { leagueId: league!.id, userId: user.id };
}

const run = (m: Movement) => getDb().transaction((tx) => post(tx, m));

async function balance(leagueId: string, userId: string) {
  const [row] = await getDb()
    .select({ balance: leagueMembers.balance })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
  return row!.balance;
}

async function lines(leagueId: string, userId: string) {
  return getDb()
    .select()
    .from(ledger)
    .where(and(eq(ledger.leagueId, leagueId), eq(ledger.userId, userId)));
}

describe("journal", () => {
  beforeEach(resetDb);

  it("écrit la ligne et le solde, renvoie le nouveau solde", async () => {
    const m = await member();
    expect(await run({ ...m, delta: 50, reason: "join_grant" })).toEqual({
      applied: true,
      balance: 50,
    });
    expect(await run({ ...m, delta: -8, reason: "wager" })).toEqual({ applied: true, balance: 42 });
    expect(await balance(m.leagueId, m.userId)).toBe(42);
    expect((await lines(m.leagueId, m.userId)).map((l) => l.delta)).toEqual([50, -8]);
  });

  it("règle 1 : un débit supérieur au solde est refusé et n'écrit rien", async () => {
    const m = await member();
    await run({ ...m, delta: 10, reason: "join_grant" });
    await expect(run({ ...m, delta: -11, reason: "wager" })).rejects.toBeInstanceOf(
      InsufficientBalanceError,
    );
    expect(await balance(m.leagueId, m.userId)).toBe(10);
    expect(await lines(m.leagueId, m.userId)).toHaveLength(1);
  });

  it("règle 1 : vingt débits simultanés sur un solde qui en couvre dix", async () => {
    const m = await member();
    await run({ ...m, delta: 50, reason: "join_grant" });
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => run({ ...m, delta: -5, reason: "wager" })),
    );
    const passed = results.filter((r) => r.status === "fulfilled");
    const refused = results.filter((r) => r.status === "rejected");
    expect(passed).toHaveLength(10);
    expect(
      refused.every((r) => r.status === "rejected" && r.reason instanceof InsufficientBalanceError),
    ).toBe(true);
    expect(await balance(m.leagueId, m.userId)).toBe(0);
    expect(await lines(m.leagueId, m.userId)).toHaveLength(11);
  });

  it("règle 2 : une erreur après post dans la même transaction n'en laisse rien", async () => {
    const m = await member();
    await expect(
      getDb().transaction(async (tx) => {
        await post(tx, { ...m, delta: 30, reason: "round" });
        throw new Error("échec après le mouvement");
      }),
    ).rejects.toThrow("échec après le mouvement");
    expect(await balance(m.leagueId, m.userId)).toBe(0);
    expect(await lines(m.leagueId, m.userId)).toHaveLength(0);
  });

  it("règle 3 : après des opérations mêlées et simultanées, aucun écart", async () => {
    const members = await Promise.all([member(), member(), member()]);
    for (const m of members) await run({ ...m, delta: 40, reason: "join_grant" });
    const ops = members.flatMap((m, i) =>
      Array.from({ length: 15 }, (_, j) =>
        run({
          ...m,
          delta: j % 3 === 0 ? 7 : -(j % 5) - 1,
          reason: j % 3 === 0 ? "round" : "wager",
          uniqueKey: j % 4 === 0 ? `test:${i}:${j % 8}` : undefined,
        }),
      ),
    );
    await Promise.allSettled(ops);
    expect(await findDiscrepancies(getDb())).toEqual([]);
  });

  it("règle 4 : dix crédits simultanés de même clé n'écrivent qu'une ligne", async () => {
    const m = await member();
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        run({ ...m, delta: 10, reason: "weekly_grant", uniqueKey: "week:test" }),
      ),
    );
    expect(results.filter((r) => r.applied)).toHaveLength(1);
    expect(results.every((r) => r.balance === 10)).toBe(true);
    expect(await lines(m.leagueId, m.userId)).toHaveLength(1);
    expect(await balance(m.leagueId, m.userId)).toBe(10);
  });

  it("findDiscrepancies signale un solde qui ne correspond plus au journal", async () => {
    const m = await member();
    await run({ ...m, delta: 20, reason: "join_grant" });
    // Écriture interdite ailleurs, faite ici pour vérifier la détection.
    await getDb()
      .update(leagueMembers)
      .set({ balance: 25 })
      .where(and(eq(leagueMembers.leagueId, m.leagueId), eq(leagueMembers.userId, m.userId)));
    expect(await findDiscrepancies(getDb())).toEqual([{ ...m, balance: 25, journal: 20 }]);
  });

  it("la contrainte balance >= 0 reste le dernier filet", async () => {
    const m = await member();
    await expect(
      getDb().update(leagueMembers).set({ balance: -1 }).where(eq(leagueMembers.userId, m.userId)),
    ).rejects.toThrow();
  });
});
