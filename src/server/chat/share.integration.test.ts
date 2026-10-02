import { beforeEach, describe, expect, it } from "vitest";
import { createBet } from "@/server/bets";
import { NotFoundError } from "@/server/errors";
import { at, betWithStakes, T0 } from "@/test/bet-scenarios";
import { leagueWith } from "@/test/bets";
import { resetDb } from "@/test/db";
import { readMessages, shareBet } from "./messages";

describe("partage d'un pari", () => {
  beforeEach(resetDb);

  it("un pari de la même ligue, avec un texte facultatif, et sa carte", async () => {
    const { league, owner, players } = await leagueWith(1);
    const { betId } = await betWithStakes(league.id, owner, []);
    expect((await shareBet(players[0]!, league.id, betId, "Allez, le prochain :", at(5))).ok).toBe(
      true,
    );
    expect((await shareBet(players[0]!, league.id, betId, "", at(5))).ok).toBe(true);
    const shared = (await readMessages(players[0]!, league.id, at(6))).filter(
      (m) => m.kind === "bet",
    );
    expect(shared.map((m) => m.body)).toEqual(["Allez, le prochain :", null]);
    expect(shared[0]?.bet).toMatchObject({ id: betId, state: "open" });

    const other = await leagueWith(0);
    const foreign = await betWithStakes(other.league.id, other.owner, []);
    await expect(shareBet(players[0]!, league.id, foreign.betId, "", at(5))).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("carte d'un pari mystère : ni question ni options pour les autres", async () => {
    const { league, owner, players } = await leagueWith(1);
    const created = await createBet(
      owner,
      league.id,
      {
        question: "Question secrète partagée",
        options: ["Option-cachée-1", "Option-cachée-2"],
        moment: "SPECIAL",
        opensAt: at(30).toISOString(),
        closesAt: at(120).toISOString(),
        hiddenUntilOpen: true,
      },
      T0,
    );
    if (!created.ok) throw new Error();
    await shareBet(owner, league.id, created.betId, "", at(1));
    const text = JSON.stringify(await readMessages(players[0]!, league.id, at(2)));
    expect(text).not.toContain("Question secrète");
    expect(text).not.toContain("Option-cachée");
  });

  it("carte d'un pari ouvert : ni totaux par option ni choix des autres", async () => {
    const { league, owner, players } = await leagueWith(2);
    const { betId } = await betWithStakes(league.id, owner, [
      [players[0]!, 0, 7],
      [players[1]!, 1, 4],
    ]);
    await shareBet(owner, league.id, betId, "", at(5));
    const messages = await readMessages(players[0]!, league.id, at(6));
    const card = messages.find((m) => m.kind === "bet")?.bet;
    expect(card).toMatchObject({ state: "open", pot: 11, bettors: 2, myWager: { amount: 7 } });
    const text = JSON.stringify(messages.filter((m) => m.betId === betId));
    expect(text).not.toContain('"amount":4');
    expect(text).not.toContain("count");
    expect(text).not.toContain(players[1]!.name!);
  });
});
