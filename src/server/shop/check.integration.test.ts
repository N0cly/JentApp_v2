import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { cosmetics, leagueMembers, ledger, memberAchievements, memberCosmetics } from "@/db/schema";
import { deleteAccount } from "@/server/account/delete";
import { createBet, placeWager } from "@/server/bets";
import { findDiscrepancies, findShopDiscrepancies } from "@/server/ledger";
import { at, CLOSE, T0 } from "@/test/bet-scenarios";
import { leagueWith, optionIds } from "@/test/bets";
import { enableAchievements, resetDb } from "@/test/db";
import { purchase } from "./shop";

/** Un joueur qui achète Zinc et débloque « Premier ticket » et « Coquet ». */
async function played() {
  await enableAchievements();
  const ctx = await leagueWith(1);
  const p = ctx.players[0]!;
  const [zinc] = await getDb().select().from(cosmetics).where(eq(cosmetics.name, "Zinc"));
  await purchase(p, ctx.league.id, zinc!.id, T0);
  const created = await createBet(
    ctx.owner,
    ctx.league.id,
    { question: "Qui ?", options: ["A", "B"], moment: "NIGHT", closesAt: CLOSE.toISOString() },
    T0,
  );
  if (!created.ok) throw new Error("pari");
  const [a] = await optionIds(created.betId);
  await placeWager(
    p,
    ctx.league.id,
    created.betId,
    { optionId: a!, amount: 1, ticketId: randomUUID() },
    at(1),
  );
  return { ...ctx, p, zinc: zinc! };
}

describe("journal : boutique et succès", () => {
  beforeEach(resetDb);

  it("chaque achat payant a sa ligne purchase, chaque succès récompensé sa ligne achievement", async () => {
    const s = await played();
    expect(await findShopDiscrepancies(getDb())).toEqual([]);
    expect(await findDiscrepancies(getDb())).toEqual([]);
    const reasons = await getDb()
      .select({ reason: ledger.reason, delta: ledger.delta })
      .from(ledger)
      .where(eq(ledger.userId, s.p.id));
    expect(reasons).toEqual(
      expect.arrayContaining([
        { reason: "purchase", delta: -20 },
        { reason: "achievement", delta: 5 },
      ]),
    );
  });

  it("repère un prix payé qui ne tombe pas juste et une ligne sans achat", async () => {
    const s = await played();
    await getDb().update(memberCosmetics).set({ pricePaid: 25 });
    expect((await findShopDiscrepancies(getDb())).map((d) => [d.problem, d.detail])).toEqual([
      ["purchase", "achat à 25, journal 20"],
    ]);
    await getDb().delete(memberCosmetics).where(eq(memberCosmetics.userId, s.p.id));
    expect((await findShopDiscrepancies(getDb())).map((d) => d.detail)).toEqual([
      "ligne sans achat",
    ]);
  });

  it("repère une récompense sans succès débloqué", async () => {
    const s = await played();
    await getDb().delete(memberAchievements).where(eq(memberAchievements.userId, s.p.id));
    const issues = await findShopDiscrepancies(getDb());
    expect(issues.map((d) => [d.problem, d.detail])).toEqual([
      ["achievement", "ligne sans succès débloqué"],
      ["achievement", "ligne sans succès débloqué"],
    ]);
  });
});

describe("suppression de compte", () => {
  beforeEach(resetDb);

  it("efface possessions, apparence et succès ; le journal reste juste", async () => {
    const s = await played();
    expect(
      await deleteAccount(
        { id: s.p.id, username: s.p.name!, email: s.p.email },
        s.p.name,
        new Date(),
      ),
    ).toEqual({ ok: true });
    expect(
      await getDb().select().from(memberCosmetics).where(eq(memberCosmetics.userId, s.p.id)),
    ).toEqual([]);
    expect(
      await getDb().select().from(memberAchievements).where(eq(memberAchievements.userId, s.p.id)),
    ).toEqual([]);
    const [m] = await getDb()
      .select()
      .from(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, s.league.id), eq(leagueMembers.userId, s.p.id)));
    expect([m!.avatarCosmeticId, m!.borderCosmeticId]).toEqual([null, null]);
    const lines = await getDb().select().from(ledger).where(eq(ledger.userId, s.p.id));
    expect(lines.some((l) => l.reason === "purchase")).toBe(true);
    expect(await findShopDiscrepancies(getDb())).toEqual([]);
    expect(await findDiscrepancies(getDb())).toEqual([]);
  });
});
