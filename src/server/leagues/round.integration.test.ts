import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { auditLog, ledger, leagueMembers, leagues } from "@/db/schema";
import { NotFoundError } from "@/server/errors";
import { findDiscrepancies } from "@/server/ledger";
import { resetDb } from "@/test/db";
import { createUser } from "@/test/factories";
import { changeRole, createLeague, joinLeague, leaveLeague } from "./leagues";
import { offerRound } from "./round";

async function setup() {
  const owner = await createUser();
  const admin = await createUser();
  const player = await createUser();
  const gone = await createUser();
  const result = await createLeague(
    { id: owner.id },
    { name: "Coloc", joinGrant: 50, weeklyGrant: 10, seedAmount: 5 },
    new Date(),
  );
  if (!result.ok) throw new Error("ligue");
  const [league] = await getDb().select().from(leagues).where(eq(leagues.id, result.leagueId));
  for (const u of [admin, player, gone])
    await joinLeague({ id: u.id }, league!.inviteCode, new Date());
  await changeRole({ id: owner.id }, league!.id, admin.id, "admin");
  await leaveLeague({ id: gone.id }, league!.id, new Date());
  return { leagueId: league!.id, owner, admin, player, gone };
}

async function balances(leagueId: string) {
  const rows = await getDb()
    .select({ userId: leagueMembers.userId, balance: leagueMembers.balance })
    .from(leagueMembers)
    .where(eq(leagueMembers.leagueId, leagueId));
  return Object.fromEntries(rows.map((r) => [r.userId, r.balance]));
}

describe("tournée générale", () => {
  beforeEach(resetDb);

  it("le même montant pour chaque membre actif, owner compris ; pas pour les partis", async () => {
    const s = await setup();
    const result = await offerRound(s.owner, s.leagueId, { roundId: randomUUID(), amount: 10 });
    expect(result).toEqual({ ok: true, members: 3, created: 30, alreadyPaid: false });
    const after = await balances(s.leagueId);
    expect([after[s.owner.id], after[s.admin.id], after[s.player.id], after[s.gone.id]]).toEqual([
      60, 60, 60, 50,
    ]);
    const [entry] = await getDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.leagueId, s.leagueId), eq(auditLog.action, "round.offered")));
    expect(entry?.details).toMatchObject({ amount: 10, members: 3 });
    expect(await findDiscrepancies(getDb())).toEqual([]);
  });

  it("réservée à l'owner", async () => {
    const s = await setup();
    for (const actor of [s.admin, s.player, s.gone]) {
      await expect(
        offerRound(actor, s.leagueId, { roundId: randomUUID(), amount: 10 }),
      ).rejects.toBeInstanceOf(NotFoundError);
    }
    expect(await getDb().select().from(ledger).where(eq(ledger.reason, "round"))).toHaveLength(0);
  });

  it("de 1 à 100 clopes", async () => {
    const s = await setup();
    for (const amount of [0, 101, 2.5, "abc"]) {
      expect(await offerRound(s.owner, s.leagueId, { roundId: randomUUID(), amount })).toEqual({
        ok: false,
        fieldErrors: { amount: "Un nombre entier entre 1 et 100." },
      });
    }
    expect((await offerRound(s.owner, s.leagueId, { roundId: randomUUID(), amount: 100 })).ok).toBe(
      true,
    );
  });

  it("règle 4 : un double envoi ne paie qu'une fois, même simultané", async () => {
    const s = await setup();
    const roundId = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => offerRound(s.owner, s.leagueId, { roundId, amount: 10 })),
    );
    expect(results.filter((r) => r.ok && !r.alreadyPaid)).toHaveLength(1);
    expect(await getDb().select().from(ledger).where(eq(ledger.refId, roundId))).toHaveLength(3);
    expect(
      await getDb().select().from(auditLog).where(eq(auditLog.action, "round.offered")),
    ).toHaveLength(1);
    expect((await balances(s.leagueId))[s.player.id]).toBe(60);
  });
});
