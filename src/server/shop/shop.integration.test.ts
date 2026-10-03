import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { cosmetics, leagueMembers, ledger, memberCosmetics } from "@/db/schema";
import { joinLeague } from "@/server/leagues";
import { findDiscrepancies } from "@/server/ledger";
import { leagueWith } from "@/test/bets";
import { resetDb } from "@/test/db";
import { equip, myCosmetics, purchase, shopMessages, shopView } from "./shop";

const NOW = new Date("2026-10-07T18:00:00Z");

async function border(name: string) {
  const [row] = await getDb().select().from(cosmetics).where(eq(cosmetics.name, name));
  return row!;
}

async function member(leagueId: string, userId: string) {
  const [row] = await getDb()
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
  return row!;
}

async function ledgerOf(leagueId: string, userId: string) {
  return getDb()
    .select()
    .from(ledger)
    .where(
      and(eq(ledger.leagueId, leagueId), eq(ledger.userId, userId), eq(ledger.reason, "purchase")),
    );
}

describe("achat", () => {
  beforeEach(resetDb);

  it("débit, possession et équipement dans la même transaction", async () => {
    const ctx = await leagueWith(1);
    const p = ctx.players[0]!;
    const zinc = await border("Zinc");
    expect(await purchase(p, ctx.league.id, zinc.id, NOW)).toEqual({ ok: true, balance: 30 });
    const rows = await ledgerOf(ctx.league.id, p.id);
    expect(rows.map((r) => [r.delta, r.refId])).toEqual([[-20, zinc.id]]);
    const owned = await getDb().select().from(memberCosmetics);
    expect(owned.map((o) => [o.userId, o.cosmeticId, o.pricePaid])).toEqual([[p.id, zinc.id, 20]]);
    expect((await member(ctx.league.id, p.id)).borderCosmeticId).toBe(zinc.id);
    expect(await findDiscrepancies(getDb())).toEqual([]);
  });

  it("solde insuffisant : refus, rien d'écrit", async () => {
    const ctx = await leagueWith(1);
    const p = ctx.players[0]!;
    const nuit = await border("Nuit");
    expect(await purchase(p, ctx.league.id, nuit.id, NOW)).toEqual({
      ok: false,
      error: shopMessages.insufficient(30),
    });
    expect(await getDb().select().from(memberCosmetics)).toEqual([]);
    expect(await ledgerOf(ctx.league.id, p.id)).toEqual([]);
    expect((await member(ctx.league.id, p.id)).borderCosmeticId).toBeNull();
  });

  it("déjà possédé : refus, pas de second débit", async () => {
    const ctx = await leagueWith(1);
    const p = ctx.players[0]!;
    const zinc = await border("Zinc");
    await purchase(p, ctx.league.id, zinc.id, NOW);
    expect(await purchase(p, ctx.league.id, zinc.id, NOW)).toEqual({
      ok: false,
      error: shopMessages.owned,
    });
    expect(await ledgerOf(ctx.league.id, p.id)).toHaveLength(1);
  });

  it("dix achats simultanés du même cosmétique : un seul débit", async () => {
    const ctx = await leagueWith(1);
    const p = ctx.players[0]!;
    const zinc = await border("Zinc");
    const results = await Promise.all(
      Array.from({ length: 10 }, () => purchase(p, ctx.league.id, zinc.id, NOW)),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await ledgerOf(ctx.league.id, p.id)).toHaveLength(1);
    expect((await member(ctx.league.id, p.id)).balance).toBe(30);
  });

  it("l'achat vaut pour une ligue, pas pour l'autre", async () => {
    const a = await leagueWith(1);
    const p = a.players[0]!;
    const b = await leagueWith(0);
    await joinLeague(p, b.league.inviteCode, NOW);
    const zinc = await border("Zinc");
    await purchase(p, a.league.id, zinc.id, NOW);
    await expect(equip(p, b.league.id, "border", zinc.id)).rejects.toMatchObject({ status: 404 });
    const shop = await shopView(p, b.league.id);
    expect(shop.items.find((i) => i.id === zinc.id)?.status).toBe("buy");
    expect((await member(b.league.id, p.id)).balance).toBe(50);
  });

  it("non-membre : 404", async () => {
    const a = await leagueWith(0);
    const b = await leagueWith(0);
    const zinc = await border("Zinc");
    await expect(purchase(b.owner, a.league.id, zinc.id, NOW)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("gratuit", () => {
  beforeEach(resetDb);

  it("possédé d'office, portable, aucune ligne de journal", async () => {
    const ctx = await leagueWith(1);
    const p = ctx.players[0]!;
    const laiton = await border("Laiton");
    expect((await myCosmetics(p, ctx.league.id)).owned.map((c) => c.name)).toEqual(["Laiton"]);
    await equip(p, ctx.league.id, "border", laiton.id);
    expect((await member(ctx.league.id, p.id)).borderCosmeticId).toBe(laiton.id);
    expect(await purchase(p, ctx.league.id, laiton.id, NOW)).toEqual({
      ok: false,
      error: shopMessages.owned,
    });
    expect(await getDb().select().from(memberCosmetics)).toEqual([]);
    expect(await ledgerOf(ctx.league.id, p.id)).toEqual([]);
  });
});

describe("équipement", () => {
  beforeEach(resetDb);

  it("refus pour un cosmétique non possédé dans cette ligue", async () => {
    const ctx = await leagueWith(1);
    const zinc = await border("Zinc");
    await expect(equip(ctx.players[0]!, ctx.league.id, "border", zinc.id)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("un désactivé reste portable par qui le possède, et n'est plus achetable", async () => {
    const ctx = await leagueWith(2);
    const [p1, p2] = [ctx.players[0]!, ctx.players[1]!];
    const zinc = await border("Zinc");
    await purchase(p1, ctx.league.id, zinc.id, NOW);
    await getDb().update(cosmetics).set({ active: false }).where(eq(cosmetics.id, zinc.id));

    await equip(p1, ctx.league.id, "border", null);
    await equip(p1, ctx.league.id, "border", zinc.id);
    expect((await member(ctx.league.id, p1.id)).borderCosmeticId).toBe(zinc.id);
    expect((await myCosmetics(p1, ctx.league.id)).owned.map((c) => c.name)).toContain("Zinc");

    expect(await purchase(p2, ctx.league.id, zinc.id, NOW)).toEqual({
      ok: false,
      error: shopMessages.unavailable,
    });
    expect((await shopView(p2, ctx.league.id)).items.map((i) => i.name)).not.toContain("Zinc");
  });

  it("retirer : « Ta photo » et « Sans bordure »", async () => {
    const ctx = await leagueWith(1);
    const p = ctx.players[0]!;
    await purchase(p, ctx.league.id, (await border("Zinc")).id, NOW);
    await equip(p, ctx.league.id, "border", null);
    await equip(p, ctx.league.id, "avatar", null);
    const m = await member(ctx.league.id, p.id);
    expect([m.avatarCosmeticId, m.borderCosmeticId]).toEqual([null, null]);
  });

  it("un type ne se porte pas à la place de l'autre", async () => {
    const ctx = await leagueWith(1);
    const laiton = await border("Laiton");
    await expect(equip(ctx.players[0]!, ctx.league.id, "avatar", laiton.id)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("boutique", () => {
  beforeEach(resetDb);

  it("porté, à porter, prix et ce qu'il manque", async () => {
    const ctx = await leagueWith(1);
    const p = ctx.players[0]!;
    await purchase(p, ctx.league.id, (await border("Zinc")).id, NOW);
    const shop = await shopView(p, ctx.league.id);
    expect(shop.balance).toBe(30);
    expect(shop.items.map((i) => [i.name, i.status, i.missing])).toEqual([
      ["Laiton", "owned", 0],
      ["Zinc", "worn", 0],
      ["Carotte", "buy", 0],
      ["Enseigne", "buy", 10],
      ["Papier", "buy", 30],
      ["Nuit", "buy", 50],
    ]);
  });
});
