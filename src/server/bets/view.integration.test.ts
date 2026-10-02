import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError } from "@/server/errors";
import { at, betWithStakes, CLOSE, T0 } from "@/test/bet-scenarios";
import { leagueWith, optionIds } from "@/test/bets";
import { resetDb } from "@/test/db";
import { cancelBet, createBet } from "./manage";
import { settleDue } from "./payout";
import { resolveBet } from "./result";
import { getBet, listBets } from "./view";
import { placeWager } from "./wager";

const after = (minutes: number) => new Date(CLOSE.getTime() + minutes * 60_000);

describe("visibilité", () => {
  beforeEach(resetDb);

  it("pari mystère : ni question ni options pour un autre joueur, tout pour le créateur", async () => {
    const { league, owner, players } = await leagueWith(1);
    const created = await createBet(
      owner,
      league.id,
      {
        question: "Question secrète du soir",
        options: ["Option-cachée-1", "Option-cachée-2"],
        moment: "SPECIAL",
        opensAt: at(30).toISOString(),
        closesAt: at(120).toISOString(),
        hiddenUntilOpen: true,
      },
      T0,
    );
    if (!created.ok) throw new Error();
    const forOther = JSON.stringify(await getBet(players[0]!, league.id, created.betId, T0));
    const forList = JSON.stringify(await listBets(players[0]!, league.id, T0));
    for (const text of [forOther, forList]) {
      expect(text).not.toContain("Question secrète");
      expect(text).not.toContain("Option-cachée");
    }
    expect(JSON.stringify(await getBet(owner, league.id, created.betId, T0))).toContain(
      "Question secrète",
    );
    // À l'ouverture, tout le monde voit la question.
    expect(JSON.stringify(await getBet(players[0]!, league.id, created.betId, at(30)))).toContain(
      "Question secrète",
    );
  });

  it("pari ouvert : pot et parieurs, ma mise, ni totaux par option ni choix des autres", async () => {
    const { league, owner, players } = await leagueWith(2);
    const { betId, options } = await betWithStakes(league.id, owner, [
      [players[0]!, 0, 7],
      [players[1]!, 1, 4],
    ]);
    const view = await getBet(players[0]!, league.id, betId, at(10));
    expect(view).toMatchObject({
      state: "open",
      pot: 11,
      bettors: 2,
      myWager: { optionId: options[0], amount: 7 },
    });
    const text = JSON.stringify(view);
    expect(text).not.toContain('"amount":4');
    expect(text).not.toContain(players[1]!.name!);
    expect(text).not.toContain("count");
    expect("wagers" in view).toBe(false);
  });

  it("fermé : tout, totaux et mises de chacun ; réglé : les gains", async () => {
    const { league, owner, players } = await leagueWith(3);
    const { betId, options } = await betWithStakes(league.id, owner, [
      [players[0]!, 0, 7],
      [players[1]!, 0, 3],
      [players[2]!, 1, 5],
    ]);
    const closed = await getBet(players[2]!, league.id, betId, after(1));
    expect(closed.state).toBe("closed");
    if (closed.state !== "closed") return;
    expect(closed.options.map((o) => [o.amount, o.count])).toEqual([
      [10, 2],
      [5, 1],
      [0, 0],
    ]);
    expect(closed.wagers).toHaveLength(3);
    expect(closed.permissions.canResolve).toBe(false);
    expect((await getBet(owner, league.id, betId, after(1))).permissions.canResolve).toBe(true);

    await resolveBet(owner, league.id, betId, { optionId: options[0]! }, after(2));
    const pending = await getBet(players[0]!, league.id, betId, after(3));
    expect(pending).toMatchObject({
      state: "resolved",
      pot: 20,
      seed: 5,
      oddsCents: 200,
      myGain: 14,
      settlesAt: after(12),
    });
    await settleDue(league.id, after(12));
    const settled = await getBet(players[0]!, league.id, betId, after(13));
    expect(settled).toMatchObject({ state: "settled", myGain: 14, myWager: { payout: 14 } });
  });

  it("mises rendues : la raison", async () => {
    const { league, owner, players } = await leagueWith(1);
    const alone = await betWithStakes(league.id, owner, [[players[0]!, 0, 5]]);
    await resolveBet(owner, league.id, alone.betId, { optionId: alone.options[0]! }, after(1));
    await settleDue(league.id, after(11));
    expect(await getBet(players[0]!, league.id, alone.betId, after(12))).toMatchObject({
      refund: "alone",
    });
    const cancelled = await betWithStakes(league.id, owner, [[players[0]!, 0, 5]]);
    await cancelBet(owner, league.id, cancelled.betId, at(5));
    expect(await getBet(players[0]!, league.id, cancelled.betId, at(6))).toMatchObject({
      state: "cancelled",
      refund: "cancelled",
    });
  });

  it("un non-membre reçoit une 404", async () => {
    const { league, owner } = await leagueWith(0);
    const other = await leagueWith(0);
    const { betId } = await betWithStakes(league.id, owner, []);
    await expect(getBet(other.owner, league.id, betId, at(1))).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(getBet(owner, other.league.id, betId, at(1))).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("liste Paris", () => {
  beforeEach(resetDb);

  it("ouverts, fermés, résultat saisi, programmés, puis terminés depuis moins de 24 h", async () => {
    const { league, owner, players } = await leagueWith(2);
    const mk = async (question: string, opensIn: number, closesIn: number) => {
      const r = await createBet(
        owner,
        league.id,
        {
          question,
          options: ["A", "B"],
          moment: "NIGHT",
          opensAt: at(opensIn).toISOString(),
          closesAt: at(closesIn).toISOString(),
        },
        T0,
      );
      if (!r.ok) throw new Error(JSON.stringify(r));
      return r.betId;
    };
    const closedId = await mk("Fermé bientôt", 0, 30);
    const resolvedId = await mk("Saisi bientôt", 0, 40);
    const openLate = await mk("Ouvert tard", 0, 300);
    const openSoon = await mk("Ouvert tôt", 0, 200);
    const scheduled = await mk("Programmé", 500, 600);
    const [a] = await optionIds(resolvedId);
    await placeWager(
      players[0]!,
      league.id,
      resolvedId,
      { optionId: a, amount: 1, ticketId: randomUUID() },
      at(1),
    );
    await resolveBet(owner, league.id, resolvedId, { optionId: a! }, at(45));

    const ids = (await listBets(players[1]!, league.id, at(50))).map((v) => v.id);
    expect(ids).toEqual([openSoon, openLate, closedId, resolvedId, scheduled]);

    await settleDue(league.id, at(60));
    expect((await listBets(players[1]!, league.id, at(61))).map((v) => v.id)).toContain(resolvedId);
    expect(
      (await listBets(players[1]!, league.id, at(60 + 24 * 60))).map((v) => v.id),
    ).not.toContain(resolvedId);
  });
});
