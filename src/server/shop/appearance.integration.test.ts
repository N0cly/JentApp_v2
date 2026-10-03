import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { cosmetics, leagueMembers, memberCosmetics, users } from "@/db/schema";
import { sendMessage, readMessages } from "@/server/chat";
import { joinLeague, listMembers } from "@/server/leagues";
import { getProfile, leagueRanking } from "@/server/stats";
import { leagueWith } from "@/test/bets";
import { resetDb } from "@/test/db";
import { appearanceOf, resolveAppearance } from "./appearance";
import { equip, purchase } from "./shop";

const NOW = new Date("2026-10-07T18:00:00Z");

describe("apparence", () => {
  beforeEach(resetDb);

  it("avatar porté, puis photo, puis initiale ; bordure portée, sinon rien", () => {
    expect(
      resolveAppearance({ avatarImage: "/a.webp", photo: "/p.webp", borderTint: "#F2B632" }),
    ).toEqual({
      image: "/a.webp",
      ring: "#F2B632",
    });
    expect(resolveAppearance({ avatarImage: null, photo: "/p.webp", borderTint: null })).toEqual({
      image: "/p.webp",
      ring: null,
    });
    expect(resolveAppearance({ avatarImage: null, photo: null, borderTint: null })).toEqual({
      image: null,
      ring: null,
    });
  });

  it("la même partout : classement, profil, membres, chat", async () => {
    const ctx = await leagueWith(1);
    const p = ctx.players[0]!;
    const id = ctx.league.id;
    await getDb().update(users).set({ image: "/photo.webp" }).where(eq(users.id, p.id));
    const [avatar] = await getDb()
      .insert(cosmetics)
      .values({ type: "avatar", name: "Chat noir", imageUrl: "/chat.webp", price: 10, position: 1 })
      .returning();
    const [zinc] = await getDb().select().from(cosmetics).where(eq(cosmetics.name, "Zinc"));

    expect(await appearanceOf(id, p.id)).toEqual({ image: "/photo.webp", ring: null });
    await purchase(p, id, zinc!.id, NOW);
    await purchase(p, id, avatar!.id, NOW);
    const expected = { image: "/chat.webp", ring: "#A9B0B8" };
    expect(await appearanceOf(id, p.id)).toEqual(expected);

    const ranked = (await leagueRanking(id, "fortune")).find((r) => r.userId === p.id)!;
    expect({ image: ranked.image, ring: ranked.ring }).toEqual(expected);
    const profile = await getProfile(ctx.owner, id, p.id, NOW);
    expect({ image: profile.image, ring: profile.ring }).toEqual(expected);
    const member = (await listMembers(ctx.owner, id)).find((m) => m.userId === p.id)!;
    expect({ image: member.image, ring: member.ring }).toEqual(expected);
    await sendMessage(p, id, { kind: "text", body: "Salut" }, NOW);
    const message = (await readMessages(ctx.owner, id, NOW)).find((m) => m.author?.id === p.id)!;
    expect({ image: message.author!.image, ring: message.author!.ring }).toEqual(expected);

    // Retirés : la photo revient, sans anneau.
    await equip(p, id, "avatar", null);
    await equip(p, id, "border", null);
    expect(await appearanceOf(id, p.id)).toEqual({ image: "/photo.webp", ring: null });
  });

  it("par ligue : ce qui est porté ailleurs ne compte pas", async () => {
    const a = await leagueWith(1);
    const p = a.players[0]!;
    const b = await leagueWith(0);
    await joinLeague(p, b.league.inviteCode, NOW);
    const [zinc] = await getDb().select().from(cosmetics).where(eq(cosmetics.name, "Zinc"));
    await purchase(p, a.league.id, zinc!.id, NOW);
    expect((await appearanceOf(a.league.id, p.id)).ring).toBe("#A9B0B8");
    expect((await appearanceOf(b.league.id, p.id)).ring).toBeNull();
    // Rien d'acheté dans la ligue B.
    const owned = await getDb()
      .select()
      .from(memberCosmetics)
      .where(and(eq(memberCosmetics.leagueId, b.league.id), eq(memberCosmetics.userId, p.id)));
    expect(owned).toEqual([]);
    const [row] = await getDb()
      .select()
      .from(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, b.league.id), eq(leagueMembers.userId, p.id)));
    expect(row!.borderCosmeticId).toBeNull();
  });
});
