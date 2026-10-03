import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { achievements, cosmetics, ledger, memberCosmetics, users } from "@/db/schema";
import { randomUUID } from "node:crypto";
import { createBet, placeWager } from "@/server/bets";
import { readPhoto } from "@/server/avatars";
import { purchase, shopView } from "@/server/shop";
import { at, CLOSE, T0 } from "@/test/bet-scenarios";
import { leagueWith, optionIds } from "@/test/bets";
import { resetDb } from "@/test/db";
import { createUser } from "@/test/factories";
import {
  catalogMessages,
  createAchievement,
  createCosmetic,
  listCatalog,
  setAchievementActive,
  setCosmeticActive,
  updateAchievement,
  updateCosmetic,
} from "./catalog";

const png = () =>
  sharp({ create: { width: 300, height: 300, channels: 3, background: "#3ddc97" } })
    .png()
    .toBuffer();

async function superAdmin() {
  const user = await createUser("Patron");
  await getDb().update(users).set({ isSuperAdmin: true }).where(eq(users.id, user.id));
  return user;
}

async function zinc() {
  const [row] = await getDb().select().from(cosmetics).where(eq(cosmetics.name, "Zinc"));
  return row!;
}

beforeAll(async () => {
  process.env.UPLOADS_DIR = await mkdtemp(join(tmpdir(), "jentapp-uploads-"));
});

describe("catalogue : droit", () => {
  beforeEach(resetDb);

  it("404 sans le droit super-admin, sur chaque action", async () => {
    const someone = await createUser();
    const z = await zinc();
    const [ach] = await getDb().select().from(achievements).limit(1);
    const input = { name: "X", price: 1, position: 0, color: "#000000" };
    const achInput = { name: "X", value: 1, reward: 1, hidden: false, position: 0 };
    const calls = [
      () => listCatalog(someone),
      () => createCosmetic(someone, "border", input),
      () => updateCosmetic(someone, z.id, input),
      () => setCosmeticActive(someone, z.id, false),
      () => createAchievement(someone, "wagers_count", achInput),
      () => updateAchievement(someone, ach!.id, achInput),
      () => setAchievementActive(someone, ach!.id, false),
    ];
    for (const call of calls) await expect(call()).rejects.toMatchObject({ status: 404 });
    expect((await zinc()).active).toBe(true);
  });
});

describe("catalogue : cosmétiques", () => {
  beforeEach(resetDb);

  it("ajouter une bordure, couleur au format #RRGGBB", async () => {
    const admin = await superAdmin();
    expect(
      await createCosmetic(admin, "border", {
        name: "Rouge",
        price: 15,
        position: 7,
        color: "rouge",
      }),
    ).toEqual({ ok: false, fieldErrors: { color: catalogMessages.color } });
    const created = await createCosmetic(admin, "border", {
      name: "Rouge",
      price: 15,
      position: 7,
      color: "#c0392b",
    });
    expect(created.ok).toBe(true);
    const all = await listCatalog(admin);
    expect(all.cosmetics.at(-1)).toMatchObject({ name: "Rouge", tintColor: "#C0392B", price: 15 });
  });

  it("ajouter un avatar avec son image, le désactiver : il quitte la boutique, reste chez qui l'a", async () => {
    const admin = await superAdmin();
    expect(await createCosmetic(admin, "avatar", { name: "Chat", price: 10, position: 1 })).toEqual(
      {
        ok: false,
        fieldErrors: { image: catalogMessages.image },
      },
    );
    const created = await createCosmetic(admin, "avatar", {
      name: "Chat",
      price: 10,
      position: 1,
      image: await png(),
    });
    if (!created.ok) throw new Error("avatar");
    const [row] = await getDb().select().from(cosmetics).where(eq(cosmetics.id, created.id));
    expect(row!.imageUrl).toMatch(/^\/avatars\/[0-9a-f-]{36}\.webp$/);
    const file = await readPhoto(row!.imageUrl!.slice("/avatars/".length));
    expect((await sharp(file!).metadata()).width).toBe(256);

    const ctx = await leagueWith(2);
    const [p1, p2] = [ctx.players[0]!, ctx.players[1]!];
    await purchase(p1, ctx.league.id, created.id, T0);
    await setCosmeticActive(admin, created.id, false);
    expect((await shopView(p2, ctx.league.id)).items.map((i) => i.id)).not.toContain(created.id);
    const owned = await getDb()
      .select()
      .from(memberCosmetics)
      .where(eq(memberCosmetics.cosmeticId, created.id));
    expect(owned.map((o) => o.userId)).toEqual([p1.id]);
  });

  it("un changement de prix ne touche pas les achats passés", async () => {
    const admin = await superAdmin();
    const ctx = await leagueWith(1);
    const p = ctx.players[0]!;
    const z = await zinc();
    await purchase(p, ctx.league.id, z.id, T0);
    expect(
      await updateCosmetic(admin, z.id, { name: "Zinc", price: 35, position: 2, color: "#A9B0B8" }),
    ).toEqual({ ok: true, id: z.id });
    const [owned] = await getDb().select().from(memberCosmetics);
    expect(owned!.pricePaid).toBe(20);
    const rows = await getDb().select().from(ledger).where(eq(ledger.reason, "purchase"));
    expect(rows.map((r) => r.delta)).toEqual([-20]);
    expect((await zinc()).price).toBe(35);
  });
});

describe("catalogue : succès", () => {
  beforeEach(resetDb);

  it("ajouter : clé tirée du nom, seuil requis sauf « broke »", async () => {
    const admin = await superAdmin();
    expect(
      await createAchievement(admin, "wins_count", {
        name: "Gros",
        value: 0,
        reward: 5,
        hidden: false,
        position: 20,
      }),
    ).toEqual({ ok: false, fieldErrors: { value: catalogMessages.value } });
    const created = await createAchievement(admin, "wins_count", {
      name: "Été chaud",
      value: 3,
      reward: 5,
      hidden: true,
      position: 20,
    });
    const broke = await createAchievement(admin, "broke", {
      name: "Été chaud",
      value: "",
      reward: 1,
      hidden: false,
      position: 21,
    });
    expect(created.ok && broke.ok).toBe(true);
    const list = (await listCatalog(admin)).achievements;
    expect(list.filter((a) => a.name === "Été chaud").map((a) => [a.key, a.ruleValue])).toEqual([
      ["ete_chaud", 3],
      ["ete_chaud_2", null],
    ]);
    await expect(
      createAchievement(admin, "inconnu", {
        name: "X",
        value: 1,
        reward: 1,
        hidden: false,
        position: 0,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("un changement de récompense ne touche pas le passé ; clé et type ne changent pas", async () => {
    const admin = await superAdmin();
    await getDb()
      .update(achievements)
      .set({ active: true })
      .where(eq(achievements.key, "first_ticket"));
    const ctx = await leagueWith(1);
    const p = ctx.players[0]!;
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
    const [first] = await getDb()
      .select()
      .from(achievements)
      .where(eq(achievements.key, "first_ticket"));
    await updateAchievement(admin, first!.id, {
      name: "Premier ticket",
      value: 2,
      reward: 50,
      hidden: false,
      position: 1,
    });
    const [after] = await getDb().select().from(achievements).where(eq(achievements.id, first!.id));
    expect([after!.key, after!.ruleType, after!.ruleValue, after!.reward]).toEqual([
      "first_ticket",
      "wagers_count",
      2,
      50,
    ]);
    const rows = await getDb()
      .select()
      .from(ledger)
      .where(and(eq(ledger.reason, "achievement"), eq(ledger.userId, p.id)));
    expect(rows.map((r) => r.delta)).toEqual([5]);
    await setAchievementActive(admin, first!.id, false);
    const [off] = await getDb().select().from(achievements).where(eq(achievements.id, first!.id));
    expect(off!.active).toBe(false);
  });
});
