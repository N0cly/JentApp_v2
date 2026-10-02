import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { auditLog, leagueMembers, leagues } from "@/db/schema";
import { NotFoundError } from "@/server/errors";
import { resetDb } from "@/test/db";
import { createUser } from "@/test/factories";
import { changeRole, createLeague, joinLeague, updateEconomy } from "./leagues";

async function setup() {
  const owner = await createUser();
  const admin = await createUser();
  const result = await createLeague(
    { id: owner.id },
    { name: "Coloc", joinGrant: 50, weeklyGrant: 10, seedAmount: 5 },
    new Date(),
  );
  if (!result.ok) throw new Error("ligue");
  const [league] = await getDb().select().from(leagues).where(eq(leagues.id, result.leagueId));
  await joinLeague({ id: admin.id }, league!.inviteCode, new Date());
  await changeRole({ id: owner.id }, league!.id, admin.id, "admin");
  return { league: league!, owner, admin };
}

async function balanceOf(leagueId: string, userId: string) {
  const [row] = await getDb()
    .select({ balance: leagueMembers.balance })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
  return row!.balance;
}

describe("réglages d'économie", () => {
  beforeEach(resetDb);

  it("bornes de M1", async () => {
    const { league, owner } = await setup();
    expect(await updateEconomy(owner, league.id, "joinGrant", 201)).toEqual({
      ok: false,
      fieldErrors: { value: "Un nombre entier entre 0 et 200." },
    });
    expect(await updateEconomy(owner, league.id, "weeklyGrant", 51)).toEqual({
      ok: false,
      fieldErrors: { value: "Un nombre entier entre 0 et 50." },
    });
    expect(await updateEconomy(owner, league.id, "seedAmount", -1)).toEqual({
      ok: false,
      fieldErrors: { value: "Un nombre entier entre 0 et 20." },
    });
    expect(await updateEconomy(owner, league.id, "seedAmount", 20)).toEqual({ ok: true });
  });

  it("owner seulement", async () => {
    const { league, admin } = await setup();
    await expect(updateEconomy(admin, league.id, "joinGrant", 100)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("ne vaut que pour la suite : les présents ne bougent pas, un nouveau reçoit la nouvelle dotation", async () => {
    const { league, owner, admin } = await setup();
    await updateEconomy(owner, league.id, "joinGrant", 120);
    expect(await balanceOf(league.id, owner.id)).toBe(50);
    expect(await balanceOf(league.id, admin.id)).toBe(50);
    const third = await createUser();
    await joinLeague({ id: third.id }, league.inviteCode, new Date());
    expect(await balanceOf(league.id, third.id)).toBe(120);
  });

  it("inscrit l'ancienne et la nouvelle valeur au journal de la ligue", async () => {
    const { league, owner } = await setup();
    await updateEconomy(owner, league.id, "weeklyGrant", 25);
    await updateEconomy(owner, league.id, "weeklyGrant", 25);
    const entries = await getDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.leagueId, league.id), eq(auditLog.action, "settings.changed")));
    expect(entries.map((e) => e.details)).toEqual([{ weeklyGrant: { from: 10, to: 25 } }]);
  });
});
