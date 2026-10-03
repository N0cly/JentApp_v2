import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { offerRound } from "@/server/leagues";
import { leagueWith } from "@/test/bets";
import { resetDb } from "@/test/db";
import { listNotifications } from "./center";
import { getNotifyLevel, setNotifyLevel } from "./level";

const NOW = new Date("2026-10-07T18:00:00Z");

describe("réglage par ligue", () => {
  beforeEach(resetDb);

  it("tout par défaut ; le changement vaut pour la suite", async () => {
    const ctx = await leagueWith(1);
    const p = ctx.players[0]!;
    expect(await getNotifyLevel(p, ctx.league.id)).toBe("all");
    await setNotifyLevel(p, ctx.league.id, "results_mentions");
    expect(await getNotifyLevel(p, ctx.league.id)).toBe("results_mentions");
    await offerRound(ctx.owner, ctx.league.id, { amount: 10, roundId: randomUUID() }, NOW);
    expect((await listNotifications(p, 0, NOW)).items).toEqual([]);
  });

  it("niveau inconnu ou non-membre : 404", async () => {
    const ctx = await leagueWith(1);
    const other = await leagueWith(0);
    await expect(setNotifyLevel(ctx.players[0]!, ctx.league.id, "parfois")).rejects.toMatchObject({
      status: 404,
    });
    await expect(getNotifyLevel(other.owner, ctx.league.id)).rejects.toMatchObject({ status: 404 });
    await expect(setNotifyLevel(other.owner, ctx.league.id, "none")).rejects.toMatchObject({
      status: 404,
    });
  });
});
