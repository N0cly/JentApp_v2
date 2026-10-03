import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { notifications } from "@/db/schema";
import { offerRound } from "@/server/leagues";
import { leagueWith } from "@/test/bets";
import { resetDb } from "@/test/db";
import { CENTER_PAGE_SIZE, hasUnread, listNotifications, markAllRead, markRead } from "./center";

const NOW = new Date("2026-10-07T18:00:00Z");

async function rounds(ctx: Awaited<ReturnType<typeof leagueWith>>, n: number) {
  for (let i = 0; i < n; i++) {
    await offerRound(ctx.owner, ctx.league.id, { amount: 10, roundId: randomUUID() }, NOW);
  }
}

describe("centre", () => {
  beforeEach(resetDb);

  it("lu, non lu, tout lire", async () => {
    const ctx = await leagueWith(1);
    const p = ctx.players[0]!;
    await rounds(ctx, 2);
    expect(await hasUnread(p)).toBe(true);
    const { items } = await listNotifications(p, 0, NOW);
    expect(items.map((i) => [i.read, i.leagueName])).toEqual([
      [false, "Bande"],
      [false, "Bande"],
    ]);
    expect(await markRead(p, items[0]!.id, NOW)).toEqual({
      leagueId: ctx.league.id,
      payload: { type: "round", amount: 10 },
    });
    expect((await listNotifications(p, 0, NOW)).items.map((i) => i.read).sort()).toEqual([
      false,
      true,
    ]);
    await markAllRead(p, NOW);
    expect(await hasUnread(p)).toBe(false);
  });

  it("pages de 30, la plus récente d'abord, sans doublon", async () => {
    const ctx = await leagueWith(1);
    const p = ctx.players[0]!;
    await rounds(ctx, CENTER_PAGE_SIZE + 5);
    const first = await listNotifications(p, 0, NOW);
    const second = await listNotifications(p, 1, NOW);
    expect(first.items).toHaveLength(CENTER_PAGE_SIZE);
    expect(first.hasMore).toBe(true);
    expect(second.items).toHaveLength(5);
    expect(second.hasMore).toBe(false);
    const ids = [...first.items, ...second.items].map((i) => i.id);
    expect(new Set(ids).size).toBe(CENTER_PAGE_SIZE + 5);
    const dates = [...first.items, ...second.items].map((i) => i.createdAt.getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });

  it("la notification d'un autre joueur : 404", async () => {
    const ctx = await leagueWith(2);
    await rounds(ctx, 1);
    const [theirs] = await getDb()
      .select()
      .from(notifications)
      .where(eq(notifications.userId, ctx.players[0]!.id));
    await expect(markRead(ctx.players[1]!, theirs!.id, NOW)).rejects.toMatchObject({ status: 404 });
    await expect(markRead(ctx.players[1]!, "pas-un-id", NOW)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("plus de 30 jours : supprimée à la lecture", async () => {
    const ctx = await leagueWith(1);
    const p = ctx.players[0]!;
    await rounds(ctx, 2);
    const [old] = await getDb().select().from(notifications).where(eq(notifications.userId, p.id));
    await getDb()
      .update(notifications)
      .set({ createdAt: new Date(NOW.getTime() - 31 * 24 * 3600_000) })
      .where(eq(notifications.id, old!.id));
    const { items } = await listNotifications(p, 0, NOW);
    expect(items.map((i) => i.id)).not.toContain(old!.id);
    expect(items).toHaveLength(1);
  });
});
