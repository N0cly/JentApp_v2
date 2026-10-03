import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { messages } from "@/db/schema";
import { cancelBet, correctResult, resolveBet, settleDue } from "@/server/bets";
import { joinLeague, offerRound } from "@/server/leagues";
import { at, betWithStakes, CLOSE } from "@/test/bet-scenarios";
import { leagueWith } from "@/test/bets";
import { resetDb } from "@/test/db";
import { createUser } from "@/test/factories";
import { deleteAccount } from "@/server/account/delete";
import { readMessages } from "./messages";
import { postSystemMessage } from "./system";

const after = (minutes: number) => new Date(CLOSE.getTime() + minutes * 60_000);

async function systemTexts(user: { id: string }, leagueId: string) {
  return (await readMessages(user, leagueId, new Date()))
    .filter((m) => m.kind === "system")
    .map((m) => m.text);
}

describe("messages automatiques", () => {
  beforeEach(resetDb);

  it("l'arrivée d'un compte supprimé n'est plus affichée", async () => {
    const { league, owner } = await leagueWith(0);
    const gone = await createUser("Parti");
    await joinLeague({ id: gone.id }, league.inviteCode, new Date());
    await getDb()
      .insert(messages)
      .values({ leagueId: league.id, userId: owner.id, kind: "text", body: "Salut" });
    expect(await systemTexts(owner, league.id)).toContain("Parti rejoint la ligue");
    await deleteAccount({ id: gone.id, username: "Parti", email: gone.email }, "Parti", new Date());
    const texts = await systemTexts(owner, league.id);
    expect(texts.some((t) => t?.includes("rejoint la ligue"))).toBe(false);
    // Les autres messages restent.
    const all = await readMessages(owner, league.id, new Date());
    expect(all.map((m) => m.body)).toContain("Salut");
  });

  it("un par événement, avec sa phrase", async () => {
    const { league, owner, players } = await leagueWith(3);
    const [p1, p2, p3] = [players[0]!, players[1]!, players[2]!];
    const ownerName = owner.name!;
    const paid = await betWithStakes(
      league.id,
      owner,
      [
        [p1, 0, 7],
        [p2, 0, 3],
        [p3, 1, 5],
      ],
      ["Oui", "Non"],
    );
    const alone = await betWithStakes(league.id, owner, [[p1, 0, 4]], ["Oui", "Non"]);
    const cancelled = await betWithStakes(league.id, owner, [[p2, 1, 2]], ["Oui", "Non"]);
    const tie = await betWithStakes(league.id, owner, [[p3, 0, 2]], ["Oui", "Non"]);
    // Ce pari-là reste sans résultat : il expirera.
    await betWithStakes(league.id, owner, [[p3, 1, 1]], ["Oui", "Non"]);

    await cancelBet(owner, league.id, cancelled.betId, at(10));
    await resolveBet(owner, league.id, paid.betId, { optionId: paid.options[1]! }, after(1));
    await correctResult(owner, league.id, paid.betId, { optionId: paid.options[0]! }, after(2));
    await resolveBet(owner, league.id, alone.betId, { optionId: alone.options[0]! }, after(1));
    await resolveBet(owner, league.id, tie.betId, { cancel: true }, after(1));
    await settleDue(league.id, after(12));
    await settleDue(league.id, after(7 * 24 * 60));
    await offerRound(owner, league.id, { roundId: randomUUID(), amount: 10 }, after(13));
    const newcomer = await createUser("Nouveau");
    await joinLeague(newcomer, league.inviteCode, after(14));

    const texts = await systemTexts(owner, league.id);
    expect(texts.filter((t) => t?.startsWith("Nouveau pari"))).toHaveLength(5);
    expect(texts).toContain(`Nouveau pari · par ${ownerName}`);
    expect(texts).toContain(`Pari annulé · mises rendues · par ${ownerName}`);
    expect(texts).toContain(`Résultat saisi · Non · par ${ownerName}`);
    expect(texts).toContain(`Résultat corrigé · Oui · par ${ownerName}`);
    expect(texts).toContain(`Égalité · pari annulé, mises rendues · par ${ownerName}`);
    expect(texts).toContain("Pari réglé · Oui · cote x2.00");
    expect(texts).toContain("Pari réglé · Oui · personne en face, mises rendues");
    expect(texts).toContain("Pari annulé · sans résultat depuis 7 jours");
    expect(texts).toContain(`Tournée générale · +10 pour tous · par ${ownerName}`);
    expect(texts.at(-1)).toBe("Nouveau rejoint la ligue");

    // Un message lié à un pari porte son identifiant, pour mener à sa page.
    const [opened] = await getDb()
      .select()
      .from(messages)
      .where(eq(messages.event, "bet_opened"))
      .limit(1);
    expect(opened?.betId).not.toBeNull();
  });

  it("transaction annulée : pas de message", async () => {
    const { league } = await leagueWith(0);
    await expect(
      getDb().transaction(async (tx) => {
        await postSystemMessage(
          tx,
          league.id,
          { event: "round", data: { by: league.ownerId, amount: 5 } },
          at(0),
        );
        throw new Error("annulée");
      }),
    ).rejects.toThrow("annulée");
    expect(await getDb().select().from(messages).where(eq(messages.event, "round"))).toHaveLength(
      0,
    );
  });

  it("dix settleDue simultanés : un seul « Pari réglé »", async () => {
    const { league, owner, players } = await leagueWith(2);
    const b = await betWithStakes(league.id, owner, [
      [players[0]!, 0, 5],
      [players[1]!, 1, 5],
    ]);
    await resolveBet(owner, league.id, b.betId, { optionId: b.options[0]! }, after(1));
    await Promise.all(Array.from({ length: 10 }, () => settleDue(league.id, after(12))));
    expect(
      await getDb().select().from(messages).where(eq(messages.event, "bet_settled")),
    ).toHaveLength(1);
  });
});
